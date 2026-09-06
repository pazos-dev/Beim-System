insert into users (
  id,
  name,
  username,
  email,
  password_hash,
  role,
  is_wholesaler,
  is_approved
)
values
  (
    gen_random_uuid(),
    'Administrador',
    'admin',
    'admin@beim.local',
    'scrypt$9d592b00bc3888968d1272f5c7f5baa7$4f503af5246a2aa18789abeec57c0847ba382bc2832134b6374d0d02791fade761af86574da1cc8b8ec630a44be3a6cfc5d5c27413fed3c659dbfc243d46534f',
    'admin',
    true,
    true
  ),
  (
    gen_random_uuid(),
    'Administrador principal',
    'administradorprincipal',
    'administradorprincipal@beim.local',
    'scrypt$3133cddba452d266e6f03da0e089cac0$244197a2c2273a6ab168903367228b015357176b65891c244a3dee65e0f30308acc45b0ae40235d78e9144f101e939995efa71c76139a11888e4b85166998e97',
    'superadmin',
    true,
    true
  ),
  (
    gen_random_uuid(),
    'Beim Tecnologia',
    'beim.tecnologia@gmail.com',
    'beim.tecnologia@gmail.com',
    'scrypt$295665206b4972e928bb382e84c3a5d1$997d0ea319faaa1901fe2d1e9dcc8f453d45abcc1650ec3eef16040856f326e7660db9b33a2d63eefa117d16c2fd6bd3499c99a7a4d1ab29b85dff08cac66bfa',
    'cliente',
    false,
    true
  )
on conflict (email) do nothing;

insert into app_settings (key, value)
values
  ('store', '{"whatsapp":"59892514774","instagram":"https://www.instagram.com/beim.uy/","heroText":"Celulares, notebooks, audio, gaming, accesorios y servicio tecnico con stock real, garantia y atencion rapida.","productBrands":["Samsung","iPhone","Motorola","Xiaomi","Honor","Huawei"],"paymentMethods":[{"id":"transferencia-bancaria","name":"Transferencia bancaria","detail":"Confirmacion manual por comprobante","instructions":"Realiza la transferencia y luego envia el comprobante a administracion para confirmar el pago.","isActive":true,"sortOrder":1},{"id":"efectivo-retiro","name":"Efectivo / retiro","detail":"Pago al retirar o en entrega acordada","instructions":"Tu pedido queda reservado y coordinamos retiro o entrega para concretar el pago.","isActive":true,"sortOrder":2},{"id":"usdt","name":"USDT","detail":"Cripto con validacion manual","instructions":"Envia el pago por la red indicada y comparte el comprobante o hash para verificarlo manualmente.","isActive":true,"sortOrder":3}]}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

insert into categories (id, name, code, description, parent_id, sort_order)
values
  ('celulares', 'Celulares', 'CEL', 'Smartphones nuevos, semi nuevos y accesorios', null, 1),
  ('notebooks', 'Notebooks', 'NB', 'Equipos para trabajo, estudio y gaming', null, 2),
  ('audio', 'Audio', 'AUD', 'Auriculares, parlantes y accesorios', null, 3),
  ('smartwatch', 'Smartwatch', 'SW', 'Relojes inteligentes y bandas', null, 4),
  ('gaming', 'Gaming', 'GM', 'Consolas, controles y perifericos', null, 5),
  ('accesorios', 'Accesorios', 'ACC', 'Cargadores, cables, fundas y hubs', null, 6),
  ('servicio', 'Servicio', 'SRV', 'Diagnostico, configuracion y soporte tecnico', null, 7)
on conflict (id) do update
set name = excluded.name,
    code = excluded.code,
    description = excluded.description,
    parent_id = excluded.parent_id,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into products (id, name, category_id, brand, model, price, currency, stock, badge, image, description)
values
  ('smartphone-premium', 'Smartphone premium', 'celulares', 'iPhone', '16 Pro', 35600, 'UYU', 8, 'Nuevo', 'assets/iphone16pro-black.png', '256GB - 5G - Camara pro'),
  ('notebook-ultraliviana', 'Notebook ultraliviana', 'notebooks', 'Samsung', 'Book', 30400, 'UYU', 3, 'Popular', 'NB', 'SSD - 16GB RAM - Ideal trabajo'),
  ('auriculares-wireless', 'Auriculares wireless', 'audio', 'Honor', 'Choice', 3800, 'UYU', 14, 'Oferta', 'AUD', 'Bluetooth - Cancelacion - Estuche'),
  ('reloj-inteligente', 'Reloj inteligente', 'smartwatch', 'Huawei', 'Fit', 5200, 'UYU', 10, 'Oferta', 'SW', 'Salud - Deporte - Notificaciones'),
  ('cargador-rapido', 'Cargador rapido USB-C', 'accesorios', 'Motorola', 'Turbo', 1120, 'UYU', 30, 'Nuevo', 'ACC', '20W - Cable compatible - Garantia'),
  ('combo-gaming', 'Combo gaming RGB', 'gaming', 'Xiaomi', 'Gaming Kit', 2720, 'UYU', 6, 'Popular', 'GM', 'Teclado - Mouse - Mousepad')
on conflict (id) do update
set name = excluded.name,
    category_id = excluded.category_id,
    brand = excluded.brand,
    model = excluded.model,
    price = excluded.price,
    currency = excluded.currency,
    stock = excluded.stock,
    badge = excluded.badge,
    image = excluded.image,
    description = excluded.description,
    updated_at = now();

insert into promo_slides (
  id, eyebrow, title, text, image, primary_label, primary_href, secondary_label, secondary_href,
  image_x, image_y, image_scale, image_frame_preset, sort_order
)
values
  ('slide-1', 'Tecnología original', 'Tecnología, repuestos y accesorios con stock real', 'Celulares, notebooks, audio, repuestos y accesorios con garantía, atención rápida y disponibilidad clara.', 'assets/hero-slide1-tech.svg', 'Comprar ahora', '#catalogo', 'Consultar', 'https://wa.me/59892514774?text=Hola!%20Quiero%20armar%20mi%20setup%20tech', 50, 50, 1, 'default', 1),
  ('slide-2', 'Ofertas de la semana', 'Combos, accesorios y equipos listos para entrega', 'Ofertas, combos y equipos listos para retirar o enviar. Consultá disponibilidad y precio final por WhatsApp.', 'assets/service-repair.png', 'Ver destacados', '#catalogo', 'WhatsApp', 'https://wa.me/59892514774?text=Hola!%20Quiero%20consultar%20por%20las%20ofertas', 50, 50, 1, 'default', 2),
  ('slide-3', 'Empresas y soporte', 'Equipamiento tech y soporte para empresas', 'Compras por volumen, servicio técnico y asesoramiento para renovar equipos con stock real.', 'assets/iphone16pro-white.png', 'Pedir cotización', '#empresas', 'Servicio técnico', '#servicios', 50, 50, 1, 'default', 3)
on conflict (id) do update
set eyebrow = excluded.eyebrow,
    title = excluded.title,
    text = excluded.text,
    image = excluded.image,
    primary_label = excluded.primary_label,
    primary_href = excluded.primary_href,
    secondary_label = excluded.secondary_label,
    secondary_href = excluded.secondary_href,
    image_x = excluded.image_x,
    image_y = excluded.image_y,
    image_scale = excluded.image_scale,
    image_frame_preset = excluded.image_frame_preset,
    sort_order = excluded.sort_order,
    updated_at = now();
