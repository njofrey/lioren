/**
 * 🧪 ENDPOINT DE VALIDACIÓN (SIN EMISIÓN REAL)
 * Valida la estructura de datos sin emitir documentos reales
 */

// Reutilizar funciones de validación del archivo principal
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

function formatearItems(items) {
  return items.map((item, index) => ({
    codigo: item.sku || item.variant_id || `PROD-${index + 1}`,
    nombre: (item.title || item.name || 'Producto').substring(0, 80),
    cantidad: item.quantity || 1,
    unidad: 'UN',
    precio: Math.round((item.price || 0)),
    exento: false,
    descripcion: (item.description || item.title || '').substring(0, 1000)
  }));
}

function generarPayloadBoleta(data) {
  const payload = {
    emisor: {
      tipodoc: '39',
      servicio: 3,
      observaciones: `Venta online - Shopify Order ${data.orderNumber || 'N/A'}`
    },
    detalles: formatearItems(data.items),
    expects: 'all'
  };
  
  if (data.rut && data.company) {
    payload.receptor = {
      rut: data.rut.replace(/[^0-9kK]/g, ''),
      rs: data.company.substring(0, 100),
      comuna: 95,
      ciudad: 76,
      direccion: (data.shipping?.address1 || 'Sin dirección').substring(0, 50)
    };
  }
  
  return payload;
}

function generarPayloadFactura(data) {
  return {
    emisor: {
      tipodoc: '33',
      fecha: new Date().toISOString().split('T')[0],
      observaciones: `Venta online - Shopify Order ${data.orderNumber || 'N/A'}`
    },
    receptor: {
      rut: data.rut.replace(/[^0-9kK]/g, ''),
      rs: data.company.substring(0, 100),
      giro: data.giro.substring(0, 40),
      comuna: 95,
      ciudad: 76,
      direccion: (data.shipping?.address1 || 'Sin dirección').substring(0, 50),
      email: (data.email || '').substring(0, 80),
      telefono: (data.phone || '').substring(0, 9)
    },
    detalles: formatearItems(data.items),
    expects: 'all'
  };
}

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
 * 🧪 ENDPOINT DE VALIDACIÓN - NO EMITE DOCUMENTOS REALES
 */
module.exports = async function handler(req, res) {
  if (handleCORS(req, res)) return;
  
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Método no permitido. Use POST.'
    });
  }
  
  try {
    console.log('🧪 Validación de estructura DTE (sin emisión real)');
    
    // Validar datos
    const errores = validarDatos(req.body);
    if (errores.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Datos inválidos',
        details: errores
      });
    }
    
    // Generar payload según tipo
    let payload;
    let endpoint;
    
    if (req.body.docType === '33') {
      payload = generarPayloadFactura(req.body);
      endpoint = '/dtes';
    } else {
      payload = generarPayloadBoleta(req.body);
      endpoint = '/boletas';
    }
    
    // Simular respuesta exitosa sin emitir documento real
    res.status(200).json({
      success: true,
      message: `✅ Validación exitosa - ${req.body.docType === '33' ? 'Factura' : 'Boleta'} lista para emitir`,
      validation: {
        endpoint: `https://www.lioren.cl/api${endpoint}`,
        payload_generado: payload,
        datos_validados: req.body,
        nota: '🧪 ESTA ES SOLO UNA VALIDACIÓN - NO SE EMITIÓ DOCUMENTO REAL'
      },
      ready_for_production: true,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error en validación:', error);
    
    res.status(500).json({
      success: false,
      error: 'Error en validación',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};