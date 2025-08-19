/**
 * 🚀 WEBHOOK LIOREN-SHOPIFY INTEGRATION
 * Emite boletas y facturas automáticamente desde Shopify
 * Autor: Nicolas Jofre - A Gourmet
 */

// Configuración (¡CAMBIAR POR TUS CREDENCIALES!)
const LIOREN_CONFIG = {
  baseUrl: 'https://api.lioren.enterprises/v1',
  // ⚠️ IMPORTANTE: Agrega tu API key en las variables de entorno de Vercel
  apiKey: process.env.LIOREN_API_KEY || 'TU_API_KEY_AQUI',
  timeout: 30000
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
 * Valida los datos recibidos del frontend
 */
function validarDatos(data) {
  const errores = [];
  
  if (!data.docType || !['33', '39'].includes(data.docType)) {
    errores.push('Tipo de documento inválido');
  }
  
  if (data.docType === '33') {
    if (!data.rut || !validarRUT(data.rut)) {
      errores.push('RUT inválido para factura');
    }
    if (!data.company || data.company.trim().length < 3) {
      errores.push('Nombre de empresa requerido para factura');
    }
    if (!data.giro || data.giro.trim().length < 3) {
      errores.push('Giro empresarial requerido para factura');
    }
  }
  
  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    errores.push('Items de venta requeridos');
  }
  
  if (!data.total || data.total <= 0) {
    errores.push('Total de venta debe ser mayor a 0');
  }
  
  return errores;
}

/**
 * Formatea los items para la API de Lioren
 */
function formatearItems(items) {
  return items.map((item, index) => ({
    line_number: index + 1,
    name: item.title || item.name || 'Producto',
    description: item.description || item.title || 'Producto',
    quantity: item.quantity || 1,
    unit: 'UN',
    unit_price: Math.round((item.price || 0) * 100) / 100, // Redondeamos a 2 decimales
    total: Math.round((item.line_price || item.price * item.quantity || 0) * 100) / 100,
    sku: item.sku || item.variant_id || `PROD-${index + 1}`,
    // Datos fiscales chilenos
    tax_type: 1, // IVA
    tax_rate: 19, // 19% IVA Chile
    tax_amount: Math.round((item.line_price || item.price * item.quantity || 0) * 0.19 * 100) / 100
  }));
}

/**
 * Emite una boleta (documento tipo 39)
 */
async function emitirBoleta(data) {
  const payload = {
    document_type: 39,
    date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    client: {
      // Para boletas, cliente genérico
      tax_id: '66666666-6',
      name: 'CONSUMIDOR FINAL',
      address: data.shipping?.address1 || 'Sin dirección',
      city: data.shipping?.city || data.commune || 'Sin comuna',
      state: data.region || 'Sin región'
    },
    items: formatearItems(data.items),
    notes: `Venta online - Shopify Order ${data.orderNumber || 'N/A'}`
  };
  
  return await llamarAPILioren('/documents', payload);
}

/**
 * Emite una factura (documento tipo 33)
 */
async function emitirFactura(data) {
  const payload = {
    document_type: 33,
    date: new Date().toISOString().split('T')[0],
    client: {
      tax_id: data.rut,
      name: data.company,
      business_line: data.giro,
      address: data.shipping?.address1 || 'Sin dirección',
      city: data.shipping?.city || data.commune || 'Sin comuna',
      state: data.region || 'Sin región',
      // Campos adicionales para facturas
      email: data.email || '',
      phone: data.phone || ''
    },
    items: formatearItems(data.items),
    notes: `Venta online - Shopify Order ${data.orderNumber || 'N/A'}`
  };
  
  return await llamarAPILioren('/documents', payload);
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
 * Manejo de CORS para peticiones OPTIONS
 */
function handleCORS(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

/**
 * 🚀 FUNCIÓN PRINCIPAL - ENDPOINT VERCEL
 */
module.exports = async function handler(req, res) {
  // Manejo de CORS
  if (handleCORS(req, res)) return;
  
  // Solo acepta POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Método no permitido. Use POST.'
    });
  }
  
  try {
    console.log('🚀 Nueva solicitud de emisión DTE');
    console.log('📨 Body recibido:', JSON.stringify(req.body, null, 2));
    
    // Validar datos
    const errores = validarDatos(req.body);
    if (errores.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Datos inválidos',
        details: errores
      });
    }
    
    // Emitir documento según tipo
    let resultado;
    if (req.body.docType === '33') {
      console.log('📄 Emitiendo FACTURA');
      resultado = await emitirFactura(req.body);
    } else {
      console.log('🧾 Emitiendo BOLETA');
      resultado = await emitirBoleta(req.body);
    }
    
    // Respuesta exitosa
    res.status(200).json({
      success: true,
      message: `${req.body.docType === '33' ? 'Factura' : 'Boleta'} emitida exitosamente`,
      data: {
        folio: resultado.folio || 'N/A',
        tipoDTE: req.body.docType,
        fechaEmision: new Date().toISOString().split('T')[0],
        urlPDF: resultado.urlPDF || null,
        urlXML: resultado.urlXML || null,
        timestamp: new Date().toISOString()
      }
    });
    
    console.log('✅ DTE emitido exitosamente!');
    
  } catch (error) {
    console.error('❌ Error procesando solicitud:', error);
    
    // Respuesta de error
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}