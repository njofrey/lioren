# 🚀 Lioren-Shopify Webhook Integration v2.0

Webhook para emitir boletas y facturas automáticamente desde Shopify usando la API de Lioren.

## 📋 Características v2.0

* ✅ **Webhook `orders/paid`** - Emisión automática al pagar orden
* ✅ **Webhook `refunds/create`** - Notas de Crédito automáticas para devoluciones
* ✅ **Idempotencia** con `order.id` - No duplica emisiones
* ✅ **Metafields** - Guarda folio y PDF en la orden
* ✅ **Cálculos reales** - Neto, IVA, totales desde la orden real
* ✅ **Validación robusta** - RUT, empresa, datos requeridos
* ✅ **Fallback inteligente** - Factura → Boleta si faltan datos
* ✅ **CORS configurado** para Shopify

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

```bash
# Lioren API
LIOREN_API_KEY=tu_api_key_real

# Shopify API (para metafields)
SHOPIFY_SHOP=tu-tienda.myshopify.com
SHOPIFY_ACCESS_TOKEN=tu_private_app_access_token
```

### 3. Configurar Webhooks en Shopify

En tu admin de Shopify, ve a **Settings > Notifications** y agrega:

**Para emisión de DTE:**
```
URL: https://tu-proyecto.vercel.app/api/orders-paid
Event: orders/paid
Format: JSON
```

**Para devoluciones (Notas de Crédito):**
```
URL: https://tu-proyecto.vercel.app/api/refund
Event: refunds/create
Format: JSON
```

## 🔧 Arquitectura

### **Frontend (Shopify)**
- Captura datos de facturación en `cart.attributes`
- NO emite DTE desde el navegador
- Solo guarda: `billing_document_type`, `billing_rut`, `billing_company_name`, `billing_business_type`

### **Backend (Vercel)**
- Recibe webhook `orders/paid` de Shopify
- Lee `order.note_attributes` con datos capturados
- Emite DTE con datos reales de la orden
- Guarda folio en `order.metafields`

## 📊 Flujo de Datos

```
1. Usuario llena formulario → cart.attributes
2. Usuario paga orden → Shopify webhook orders/paid
3. Webhook lee order.note_attributes → datos de facturación
4. Webhook emite DTE en Lioren → folio + PDF
5. Webhook guarda folio en order.metafields
```

## 🧪 Testing

### Test del Webhook

```bash
curl -X POST https://tu-proyecto.vercel.app/api/orders-paid \
  -H "Content-Type: application/json" \
  -d '{
    "id": 12345,
    "order_number": "1001",
    "line_items": [
      {
        "id": 1,
        "name": "Producto Test",
        "quantity": 2,
        "price": "1000.00",
        "line_price": "2000.00",
        "sku": "TEST-001"
      }
    ],
    "note_attributes": [
      {"name": "billing_document_type", "value": "factura"},
      {"name": "billing_rut", "value": "12.345.678-9"},
      {"name": "billing_company_name", "value": "Empresa Test SpA"},
      {"name": "billing_business_type", "value": "Venta de productos"}
    ],
    "customer": {
      "email": "test@ejemplo.com"
    },
    "shipping_address": {
      "address1": "Av. Test 123",
      "phone": "+56912345678"
    }
  }'
```

## 📋 Endpoints

### `POST /api/orders-paid`
**Webhook principal** - Recibe órdenes pagadas de Shopify

**Request Body:**
```json
{
  "id": 12345,
  "order_number": "1001",
  "line_items": [...],
  "note_attributes": [
    {"name": "billing_document_type", "value": "factura"},
    {"name": "billing_rut", "value": "12.345.678-9"},
    {"name": "billing_company_name", "value": "Empresa SpA"},
    {"name": "billing_business_type", "value": "Venta de productos"}
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Factura emitida exitosamente",
  "data": {
    "orderId": 12345,
    "orderNumber": "1001",
    "folio": "123456",
    "tipoDTE": "33",
    "fechaEmision": "2025-01-20",
    "urlPDF": "https://...",
    "urlXML": "https://...",
    "timestamp": "2025-01-20T10:30:00Z"
  }
}
```

### `POST /api/emit-dte` (Legacy)
**Endpoint legacy** - Para emisión manual desde frontend (no recomendado)

## 🔍 Debug

### Logs en tiempo real:
```bash
vercel logs tu-proyecto --follow
```

### Verificar metafields en Shopify:
```bash
curl -H "X-Shopify-Access-Token: tu_token" \
  "https://tu-tienda.myshopify.com/admin/api/2024-01/orders/12345/metafields.json?namespace=lioren_dte"
```

## 🚨 Troubleshooting

### **Problema: Webhook no se ejecuta**
- Verificar que el webhook esté configurado en Shopify
- Verificar que la URL sea correcta
- Revisar logs de Vercel

### **Problema: DTE no se emite**
- Verificar `LIOREN_API_KEY` en Vercel
- Verificar que los `note_attributes` estén presentes
- Revisar logs de Lioren API

### **Problema: Metafields no se guardan**
- Verificar `SHOPIFY_ACCESS_TOKEN` en Vercel
- Verificar que el token tenga permisos de escritura
- Verificar que la orden exista

## 📞 Soporte

* **Autor**: Nicolas Jofre - A Gourmet
* **API Docs**: https://cl.lioren.enterprises/docs
* **Shopify Webhooks**: https://shopify.dev/docs/admin-api/rest/reference/events/webhook

## 🎯 Próximos Pasos

1. **Configurar webhook** en Shopify admin
2. **Probar con orden real** en modo test
3. **Monitorear logs** de Vercel
4. **Verificar metafields** en órdenes
5. **Optimizar** según feedback

---

**¡Tu integración Lioren-Shopify está lista para producción! 🚀**