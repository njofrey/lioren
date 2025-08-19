# 🚀 Lioren-Shopify Webhook Integration

Webhook para emitir boletas y facturas automáticamente desde Shopify usando la API de Lioren.

## 📋 Características

- ✅ Emisión automática de boletas (tipo 39)
- ✅ Emisión automática de facturas (tipo 33)  
- ✅ Validación de RUT chileno
- ✅ Manejo de errores robusto
- ✅ CORS configurado para Shopify
- ✅ Logs detallados

## 🛠️ Setup Rápido

### 1. Desplegar en Vercel
```bash
# Instalar Vercel CLI
npm i -g vercel

# Desde este directorio
vercel --prod
```

### 2. Configurar Variables de Entorno
En tu dashboard de Vercel, agrega:
```
LIOREN_API_KEY=tu_api_key_real
```

### 3. URL del Webhook
Después del deploy, tu webhook estará en:
```
https://tu-proyecto.vercel.app/api/emit-dte
```

## 🔧 Integración con Shopify

### Modificar tu módulo `boleta-y-comuna.js`:

```javascript
// Agregar después del checkout exitoso
const emitirDTE = async (orderData) => {
  try {
    const response = await fetch('https://tu-webhook.vercel.app/api/emit-dte', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docType: getDocType(), // '33' o '39'
        rut: rutInput?.value || '',
        company: companyInput?.value || '',
        giro: giroInput?.value || '',
        commune: selectedCommune,
        region: selectedRegion?.regionName,
        items: obtenerItemsCarrito(), // Función que obtienes items
        total: obtenerTotalCarrito(),
        orderNumber: 'SHOP-' + Date.now() // Temporal
      })
    });
    
    const result = await response.json();
    if (result.success) {
      console.log('✅ DTE emitido:', result.data.folio);
    }
  } catch (error) {
    console.error('❌ Error emitiendo DTE:', error);
  }
};
```

## 📊 Formato de Datos

### Request al webhook:
```json
{
  "docType": "33",
  "rut": "12345678-9",
  "company": "Mi Empresa SpA",
  "giro": "Venta de alimentos",
  "commune": "Santiago",
  "region": "Región Metropolitana",
  "items": [
    {
      "title": "Producto 1",
      "quantity": 2,
      "price": 10000,
      "line_price": 20000
    }
  ],
  "total": 23800,
  "orderNumber": "SHOP-1234"
}
```

### Response del webhook:
```json
{
  "success": true,
  "message": "Factura emitida exitosamente",
  "data": {
    "folio": "123456",
    "tipoDTE": "33",
    "fechaEmision": "2025-01-20",
    "urlPDF": "https://...",
    "timestamp": "2025-01-20T10:30:00Z"
  }
}
```

## 🐛 Debug

Logs en tiempo real:
```bash
vercel logs tu-proyecto --follow
```

## 📞 Soporte

- **Autor**: Nicolas Jofre - A Gourmet
- **API Docs**: https://cl.lioren.enterprises/docs