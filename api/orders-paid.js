/**
 * 🚀 WEBHOOK SHOPIFY ORDERS/PAID
 * Recibe órdenes pagadas de Shopify y emite DTE automáticamente
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
 * Valida el RUT chileno
 */
function validarRUT(rut) {
  if (!rut) return false;
  const rutLimpio = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (rutLimpio.length < 7) return false;
  
  const cuerpo = rutLimpio.slice(0, -1);
  const dv = rutLimpio.slice(-1);
  
  let suma = 0;
  let multiplicador = 2;
  
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  
  const dvCalculado = 11 - (suma % 11);
  const dvFinal = dvCalculado === 11 ? '0' : dvCalculado === 10 ? 'K' : String(dvCalculado);
  
  return dv === dvFinal;
}

/**
 * Extrae datos de facturación de los note_attributes de la orden
 */
function extraerDatosFacturacion(order) {
  const attributes = order.note_attributes || [];
  
  const datos = {
    docType: null,
    rut: null,
    company: null,
    giro: null
  };
  
  // Buscar en note_attributes
  attributes.forEach(attr => {
    switch (attr.name) {
      case 'billing_document_type':
        datos.docType = attr.value === 'factura' ? '33' : '39';
        break;
      case 'billing_rut':
        datos.rut = attr.value;
        break;
      case 'billing_company_name':
        datos.company = attr.value;
        break;
      case 'billing_business_type':
        datos.giro = attr.value;
        break;
    }
  });
  
  return datos;
}

/**
 * Formatea los line_items de Shopify para Lioren
 */
function formatearItemsShopify(lineItems) {
  return lineItems.map((item, index) => {
    // Calcular precios sin IVA (Shopify incluye IVA en el precio)
    const precioConIva = parseFloat(item.price);
    const precioSinIva = Math.round(precioConIva / 1.19); // IVA 19%
    const totalConIva = parseFloat(item.line_price);
    const totalSinIva = Math.round(totalConIva / 1.19);
    
    return {
      codigo: item.sku || item.variant_id?.toString() || `PROD-${index + 1}`,
      nombre: (item.name || item.title || 'Producto').substring(0, 80),
      cantidad: item.quantity,
      unidad: 'UN',
      precio: precioSinIva,
      exento: false,
      descripcion: (item.variant_title || item.name || '').substring(0, 1000),
      // Datos adicionales para cálculos
      precioConIva,
      totalSinIva,
      totalConIva
    };
  });
}

/**
 * Calcula totales de la orden
 */
function calcularTotales(items) {
  const subtotal = items.reduce((sum, item) => sum + item.totalSinIva, 0);
  const iva = items.reduce((sum, item) => sum + (item.totalConIva - item.totalSinIva), 0);
  const total = subtotal + iva;
  
  return {
    subtotal: Math.round(subtotal),
    iva: Math.round(iva),
    total: Math.round(total)
  };
}

/**
 * Emite una boleta (documento tipo 39)
 */
async function emitirBoleta(order, datosFacturacion, items, totales) {
  const payload = {
    emisor: {
      tipodoc: '39',
      servicio: 3,
      observaciones: `Venta online - Shopify Order #${order.order_number}`
    },
    detalles: items.map(item => ({
      codigo: item.codigo,
      nombre: item.nombre,
      cantidad: item.cantidad,
      unidad: item.unidad,
      precio: item.precio,
      exento: item.exento,
      descripcion: item.descripcion
    })),
    expects: 'all'
  };
  
  // Solo agregar receptor si tenemos datos del cliente
  if (datosFacturacion.rut && datosFacturacion.company) {
    payload.receptor = {
      rut: datosFacturacion.rut.replace(/[^0-9kK]/g, ''),
      rs: datosFacturacion.company.substring(0, 100),
      comuna: 95, // TODO: mapear comuna real
      ciudad: 76, // TODO: mapear ciudad real
      direccion: (order.shipping_address?.address1 || 'Sin dirección').substring(0, 50)
    };
  }
  
  return await llamarAPILioren('/boletas', payload);
}

/**
 * Emite una factura (documento tipo 33)
 */
async function emitirFactura(order, datosFacturacion, items, totales) {
  const payload = {
    emisor: {
      tipodoc: '33',
      fecha: new Date().toISOString().split('T')[0],
      observaciones: `Venta online - Shopify Order #${order.order_number}`
    },
    receptor: {
      rut: datosFacturacion.rut.replace(/[^0-9kK]/g, ''),
      rs: datosFacturacion.company.substring(0, 100),
      giro: datosFacturacion.giro.substring(0, 40),
      comuna: 95, // TODO: mapear comuna real
      ciudad: 76, // TODO: mapear ciudad real
      direccion: (order.shipping_address?.address1 || 'Sin dirección').substring(0, 50),
      email: (order.customer?.email || '').substring(0, 80),
      telefono: (order.shipping_address?.phone || '').substring(0, 9)
    },
    detalles: items.map(item => ({
      codigo: item.codigo,
      nombre: item.nombre,
      cantidad: item.cantidad,
      unidad: item.unidad,
      precio: item.precio,
      exento: item.exento,
      descripcion: item.descripcion
    })),
    expects: 'all'
  };
  
  return await llamarAPILioren('/dtes', payload);
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
 * Guarda el folio del DTE en los metafields de la orden
 */
async function guardarFolioEnMetafields(orderId, folio, urlPDF) {
  try {
    const url = `https://${SHOPIFY_CONFIG.shop}/admin/api/${SHOPIFY_CONFIG.apiVersion}/orders/${orderId}/metafields.json`;
    
    const metafields = [
      {
        metafield: {
          namespace: 'lioren_dte',
          key: 'folio',
          value: folio.toString(),
          type: 'single_line_text_field'
        }
      },
      {
        metafield: {
          namespace: 'lioren_dte',
          key: 'pdf_url',
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
    console.error('❌ Error guardando metafields:', error);
    // No lanzamos error para no fallar la emisión del DTE
  }
}

/**
 * Verifica si ya se emitió DTE para esta orden (idempotencia)
 */
async function verificarDTEEmitido(orderId) {
  try {
    const url = `https://${SHOPIFY_CONFIG.shop}/admin/api/${SHOPIFY_CONFIG.apiVersion}/orders/${orderId}/metafields.json?namespace=lioren_dte`;
    
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_CONFIG.accessToken
      }
    });
    
    if (!response.ok) {
      return false; // Si no puede verificar, proceder
    }
    
    const data = await response.json();
    const folioMetafield = data.metafields?.find(m => m.key === 'folio');
    
    return !!folioMetafield?.value;
    
  } catch (error) {
    console.error('❌ Error verificando DTE emitido:', error);
    return false; // Si hay error, proceder
  }
}

/**
 * 🚀 FUNCIÓN PRINCIPAL - WEBHOOK ORDERS/PAID
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
    console.log('🚀 Nueva orden pagada recibida');
    console.log('📨 Order ID:', req.body.id);
    console.log('📨 Order Number:', req.body.order_number);
    
    const order = req.body;
    
    // Verificar idempotencia
    const yaEmitido = await verificarDTEEmitido(order.id);
    if (yaEmitido) {
      console.log('✅ DTE ya emitido para esta orden, saltando...');
      return res.status(200).json({
        success: true,
        message: 'DTE ya emitido para esta orden',
        orderId: order.id,
        orderNumber: order.order_number
      });
    }
    
    // Extraer datos de facturación
    const datosFacturacion = extraerDatosFacturacion(order);
    console.log('📋 Datos de facturación:', datosFacturacion);
    
    // Si no hay tipo de documento, usar boleta por defecto
    if (!datosFacturacion.docType) {
      datosFacturacion.docType = '39'; // Boleta por defecto
    }
    
    // Validar datos para factura
    if (datosFacturacion.docType === '33') {
      if (!datosFacturacion.rut || !validarRUT(datosFacturacion.rut)) {
        console.log('⚠️ RUT inválido para factura, emitiendo boleta');
        datosFacturacion.docType = '39';
      }
      if (!datosFacturacion.company || datosFacturacion.company.trim().length < 3) {
        console.log('⚠️ Empresa inválida para factura, emitiendo boleta');
        datosFacturacion.docType = '39';
      }
    }
    
    // Formatear items y calcular totales
    const items = formatearItemsShopify(order.line_items || []);
    const totales = calcularTotales(items);
    
    console.log('📦 Items formateados:', items.length);
    console.log('💰 Totales:', totales);
    
    // Emitir DTE según tipo
    let resultado;
    if (datosFacturacion.docType === '33') {
      console.log('📄 Emitiendo FACTURA');
      resultado = await emitirFactura(order, datosFacturacion, items, totales);
    } else {
      console.log('🧾 Emitiendo BOLETA');
      resultado = await emitirBoleta(order, datosFacturacion, items, totales);
    }
    
    // Guardar folio en metafields
    await guardarFolioEnMetafields(order.id, resultado.folio, resultado.urlPDF);
    
    // Respuesta exitosa
    res.status(200).json({
      success: true,
      message: `${datosFacturacion.docType === '33' ? 'Factura' : 'Boleta'} emitida exitosamente`,
      data: {
        orderId: order.id,
        orderNumber: order.order_number,
        folio: resultado.folio || 'N/A',
        tipoDTE: datosFacturacion.docType,
        fechaEmision: new Date().toISOString().split('T')[0],
        urlPDF: resultado.urlPDF || null,
        urlXML: resultado.urlXML || null,
        timestamp: new Date().toISOString()
      }
    });
    
    console.log('✅ DTE emitido exitosamente para orden:', order.order_number);
    
  } catch (error) {
    console.error('❌ Error procesando orden:', error);
    
    // Respuesta de error
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
