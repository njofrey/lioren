/**
 * 🚀 WEBHOOK SHOPIFY REFUNDS
 * Maneja devoluciones y emite Notas de Crédito automáticamente
 * Autor: Nicolas Jofre - A Gourmet
 */

// Configuración
const LIOREN_CONFIG = {
  baseUrl: 'https://www.lioren.cl/api',
  apiKey: process.env.LIOREN_API_KEY || 'TU_API_KEY_AQUI',
  timeout: 30000
};

const SHOPIFY_CONFIG = {
  shop: process.env.SHOPIFY_SHOP || 'tu-tienda.myshopify.com',
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN || 'TU_ACCESS_TOKEN',
  apiVersion: '2024-01'
};

/**
 * Obtiene los metafields de una orden para encontrar el folio del DTE original
 */
async function obtenerFolioOriginal(orderId) {
  try {
    const url = `https://${SHOPIFY_CONFIG.shop}/admin/api/${SHOPIFY_CONFIG.apiVersion}/orders/${orderId}/metafields.json?namespace=lioren_dte`;
    
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_CONFIG.accessToken
      }
    });
    
    if (!response.ok) {
      throw new Error(`Error obteniendo metafields: ${response.status}`);
    }
    
    const data = await response.json();
    const folioMetafield = data.metafields?.find(m => m.key === 'folio');
    
    return folioMetafield?.value || null;
    
  } catch (error) {
    console.error('❌ Error obteniendo folio original:', error);
    return null;
  }
}

/**
 * Obtiene los datos de la orden original
 */
async function obtenerOrdenOriginal(orderId) {
  try {
    const url = `https://${SHOPIFY_CONFIG.shop}/admin/api/${SHOPIFY_CONFIG.apiVersion}/orders/${orderId}.json`;
    
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_CONFIG.accessToken
      }
    });
    
    if (!response.ok) {
      throw new Error(`Error obteniendo orden: ${response.status}`);
    }
    
    const data = await response.json();
    return data.order;
    
  } catch (error) {
    console.error('❌ Error obteniendo orden original:', error);
    return null;
  }
}

/**
 * Formatea los items de la devolución para la Nota de Crédito
 */
function formatearItemsDevolucion(refundLineItems, orderOriginal) {
  return refundLineItems.map((refundItem, index) => {
    // Buscar el item original en la orden
    const originalItem = orderOriginal.line_items.find(item => item.id === refundItem.line_item_id);
    
    if (!originalItem) {
      console.warn(`⚠️ Item original no encontrado para refund item ${refundItem.id}`);
      return null;
    }
    
    // Calcular precios sin IVA
    const precioConIva = parseFloat(originalItem.price);
    const precioSinIva = Math.round(precioConIva / 1.19);
    
    return {
      codigo: originalItem.sku || originalItem.variant_id?.toString() || `PROD-${index + 1}`,
      nombre: (originalItem.name || originalItem.title || 'Producto').substring(0, 80),
      cantidad: refundItem.quantity, // Cantidad devuelta
      unidad: 'UN',
      precio: precioSinIva,
      exento: false,
      descripcion: `Devolución - ${(originalItem.variant_title || originalItem.name || '').substring(0, 1000)}`
    };
  }).filter(item => item !== null);
}

/**
 * Emite una Nota de Crédito (documento tipo 61)
 */
async function emitirNotaCredito(orderOriginal, refundData, itemsDevolucion, folioOriginal) {
  const payload = {
    emisor: {
      tipodoc: '61', // Nota de Crédito
      fecha: new Date().toISOString().split('T')[0],
      observaciones: `Devolución - Shopify Order #${orderOriginal.order_number} - Refund #${refundData.id}`
    },
    receptor: {
      rut: orderOriginal.note_attributes?.find(attr => attr.name === 'billing_rut')?.value?.replace(/[^0-9kK]/g, '') || '',
      rs: orderOriginal.note_attributes?.find(attr => attr.name === 'billing_company_name')?.value?.substring(0, 100) || '',
      giro: orderOriginal.note_attributes?.find(attr => attr.name === 'billing_business_type')?.value?.substring(0, 40) || '',
      comuna: 95, // TODO: mapear comuna real
      ciudad: 76, // TODO: mapear ciudad real
      direccion: (orderOriginal.shipping_address?.address1 || 'Sin dirección').substring(0, 50),
      email: (orderOriginal.customer?.email || '').substring(0, 80),
      telefono: (orderOriginal.shipping_address?.phone || '').substring(0, 9)
    },
    detalles: itemsDevolucion,
    referencia: {
      tipodoc: orderOriginal.note_attributes?.find(attr => attr.name === 'billing_document_type')?.value || '39',
      folio: folioOriginal,
      fecha: orderOriginal.created_at?.split('T')[0] || new Date().toISOString().split('T')[0]
    },
    expects: 'all'
  };
  
  return await llamarAPILioren('/notas-credito', payload);
}

/**
 * Realiza la llamada a la API de Lioren
 */
async function llamarAPILioren(endpoint, payload) {
  const url = `${LIOREN_CONFIG.baseUrl}${endpoint}`;
  
  console.log(`🔥 Llamando API Lioren: ${endpoint}`);
  console.log('📦 Payload:', JSON.stringify(payload, null, 2));
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LIOREN_CONFIG.timeout);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LIOREN_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const responseData = await response.json();
    
    if (!response.ok) {
      throw new Error(`API Error ${response.status}: ${JSON.stringify(responseData)}`);
    }
    
    console.log('✅ Respuesta exitosa de Lioren:', responseData);
    return responseData;
    
  } catch (error) {
    console.error('❌ Error llamando API Lioren:', error);
    throw error;
  }
}

/**
 * Guarda el folio de la Nota de Crédito en los metafields de la orden
 */
async function guardarNotaCreditoEnMetafields(orderId, folio, urlPDF) {
  try {
    const url = `https://${SHOPIFY_CONFIG.shop}/admin/api/${SHOPIFY_CONFIG.apiVersion}/orders/${orderId}/metafields.json`;
    
    const metafields = [
      {
        metafield: {
          namespace: 'lioren_refund',
          key: 'nota_credito_folio',
          value: folio.toString(),
          type: 'single_line_text_field'
        }
      },
      {
        metafield: {
          namespace: 'lioren_refund',
          key: 'nota_credito_pdf_url',
          value: urlPDF || '',
          type: 'single_line_text_field'
        }
      }
    ];
    
    for (const metafield of metafields) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_CONFIG.accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metafield)
      });
      
      if (!response.ok) {
        console.error(`❌ Error guardando metafield ${metafield.metafield.key}:`, await response.text());
      } else {
        console.log(`✅ Metafield ${metafield.metafield.key} guardado exitosamente`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error guardando metafields de devolución:', error);
  }
}

/**
 * 🚀 FUNCIÓN PRINCIPAL - WEBHOOK REFUNDS
 */
module.exports = async function handler(req, res) {
  // Solo acepta POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Método no permitido. Use POST.'
    });
  }
  
  try {
    console.log('🚀 Nueva devolución recibida');
    console.log('📨 Refund ID:', req.body.id);
    console.log('📨 Order ID:', req.body.order_id);
    
    const refund = req.body;
    
    // Obtener folio del DTE original
    const folioOriginal = await obtenerFolioOriginal(refund.order_id);
    if (!folioOriginal) {
      console.log('⚠️ No se encontró folio original, saltando emisión de Nota de Crédito');
      return res.status(200).json({
        success: true,
        message: 'No se encontró DTE original, saltando Nota de Crédito',
        refundId: refund.id,
        orderId: refund.order_id
      });
    }
    
    // Obtener orden original
    const orderOriginal = await obtenerOrdenOriginal(refund.order_id);
    if (!orderOriginal) {
      throw new Error('No se pudo obtener la orden original');
    }
    
    // Formatear items de devolución
    const itemsDevolucion = formatearItemsDevolucion(refund.refund_line_items || [], orderOriginal);
    if (itemsDevolucion.length === 0) {
      console.log('⚠️ No hay items para devolver');
      return res.status(200).json({
        success: true,
        message: 'No hay items para devolver',
        refundId: refund.id,
        orderId: refund.order_id
      });
    }
    
    console.log('📦 Items de devolución:', itemsDevolucion.length);
    
    // Emitir Nota de Crédito
    const resultado = await emitirNotaCredito(orderOriginal, refund, itemsDevolucion, folioOriginal);
    
    // Guardar folio en metafields
    await guardarNotaCreditoEnMetafields(refund.order_id, resultado.folio, resultado.urlPDF);
    
    // Respuesta exitosa
    res.status(200).json({
      success: true,
      message: 'Nota de Crédito emitida exitosamente',
      data: {
        refundId: refund.id,
        orderId: refund.order_id,
        folioOriginal: folioOriginal,
        notaCreditoFolio: resultado.folio || 'N/A',
        fechaEmision: new Date().toISOString().split('T')[0],
        urlPDF: resultado.urlPDF || null,
        urlXML: resultado.urlXML || null,
        timestamp: new Date().toISOString()
      }
    });
    
    console.log('✅ Nota de Crédito emitida exitosamente para refund:', refund.id);
    
  } catch (error) {
    console.error('❌ Error procesando devolución:', error);
    
    // Respuesta de error
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
