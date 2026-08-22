Defining Project Structure
  Como arquitecto de software backend senior, he diseñado e implementado una arquitectura modular, desacoplada y lista para producción en      
  Node.js (ES Modules) utilizando Express y Prisma ORM, adaptada específicamente a las necesidades de seguridad y rendimiento de una Telegram  
  Mini App (TMA).                                                                                                                              
  ──────                                                                                                                                       
  ### 📁 Estructura del Proyecto                                                                                                               
                                                                                                                                               
    Fematch/                                                                                                                                   
    ├── prisma/                                                                                                                                
    │   └── schema.prisma           # Esquema de Prisma ORM optimizado para usuarios de Telegram                                               
    ├── src/                                                                                                                                   
    │   ├── config/                                                                                                                            
    │   │   └── env.js              # Validación y centralización de variables de entorno                                                      
    │   ├── controllers/                                                                                                                       
    │   │   └── authController.js   # Lógica de sincronización/upsert de usuarios                                                              
    │   ├── middlewares/                                                                                                                       
    │   │   ├── errorHandler.js     # Manejador centralizado de errores y 404                                                                  
    │   │   └── telegramAuth.js     # Middleware de validación criptográfica HMAC-SHA256                                                       
    │   ├── routes/                                                                                                                            
    │   │   ├── authRoutes.js       # Rutas de autenticación protegidas por telegramAuth                                                       
    │   │   └── index.js            # Enrutador principal de la API                                                                            
    │   ├── services/                                                                                                                          
    │   │   └── prisma.js           # Singleton de PrismaClient y serialización BigInt                                                         
    │   ├── app.js                  # Configuración de Express (CORS, Helmet, Parsers, Rutas)                                                  
    │   └── server.js               # Entrada principal del servidor con Graceful Shutdown                                                     
    ├── .env.example                # Plantilla de variables de entorno                                                                        
    ├── .gitignore                                                                                                                             
    └── package.json                # Configuración ES Modules y scripts                                                                       
  ──────                                                                    
  ### 1. package.json                                                                                                                          
                                                                                                                                               
  Configurado con "type": "module" para soporte nativo de ECMAScript Modules (ESM) y dependencias actualizadas
  ──────                                                                                                                                       
  ### 3. src/middlewares/telegramAuth.js                                                                                                       
                                                                                                                                               
  Implementación rigurosa del algoritmo de validación criptográfica de Telegram:                                                               
                                                                                                                                               
  1. Extracción flexible: Acepta Authorization: tma <initData> (estándar oficial @telegram-apps/sdk), Bearer <initData>, header personalizado  
  x-telegram-init-data o body/query.                                                                                                           
  2. Expiración de sesión: Comprueba auth_date contra una ventana de expiración configurable (por defecto 24 horas = 86,400s) y tolerancia de  
  desincronización de reloj (+60s).                                                                                                            
  3. Data-Check-String: Ordena alfabéticamente las claves key=value\n excluyendo el campo hash.                                                
  4. HMAC-SHA256: Deriva la clave secreta con "WebAppData" y calcula la firma esperada.                                                        
  5. Mitigación de Timing Attacks: Utiliza telegramAuth.js:107-119 comparando los buffers en tiempo constante.                                 
  6. Inyección en Contexto: Parsea el objeto user y monta telegramAuth.js:137-139 y req.telegramInitData.
  ──────                                                                                                                                       
  ### 4. src/server.js                                                                                                                         
                                                                                                                                               
  Servidor Express con manejo de eventos de terminación de proceso (Graceful Shutdown), desconexión segura del pool de Prisma y captura global 
  de excepciones:
    ──────                                                                                                                                       
  ### 5. prisma/schema.prisma                                                                                                                  
                                                                                                                                               
  Esquema de datos optimizado para la Mini App con soporte para identificadores de Telegram de 64 bits (BigInt)
    ──────                                                                                                                                       
  ### 🚀 Puesta en Marcha                                                                                                                      
                                                                                                                                               
  1. Instalar dependencias:                                                                                                                    
    npm install                                                                                                                                
                                                                                                                                               
  2. Configurar el entorno:                                                                                                                    
    cp .env.example .env                                                                                                                       
    # Asigna tu TELEGRAM_BOT_TOKEN real obtenido de @BotFather                                                                                 
                                                                                                                                               
  3. Generar el cliente de Prisma y ejecutar migraciones:                                                                                      
    npm run prisma:generate                                                                                                                    
    npm run prisma:migrate                                                                                                                     
                                                                                                                                               
  4. Ejecutar en desarrollo:                                                                                                                   
    npm run dev                                                                                                                                
                                                                                                                                               
  5. Probar el endpoint de autenticación:                                                                                                      
  Envía una petición a POST /api/auth/telegram incluyendo la cabecera:                                                                         
    Authorization: tma query_id=...&user=...&auth_date=...&hash=...                                                                            
  El middleware validará criptográficamente los datos, deserializará req.telegramUser y realizará un upsert automático en tu base de datos con 
  Prisma.
  ──────                                                                                                                                       
  ### 🔍 Decisiones de Arquitectura y Optimizaciones Aplicadas                                                                                 
                                                                                                                                               
  1. Tipos Nativos y Eficiencia en PostgreSQL:                                                                                                 
      • Llaves primarias y foráneas con @db.Uuid nativo para menor huella de memoria y mejores tiempos de indexación que cadenas de texto      
      arbitrarias.                                                                                                                             
      • Timestamps con @db.Timestamptz para garantizar precisión con zona horaria UTC global.                                                  
      • birthDate con tipo @db.Date para evitar almacenar horas/minutos innecesarios.                                                          
      • Campos de conteo/orden (orderIndex, minAge, maxAge, maxDistanceKm) tipados como @db.SmallInt (2 bytes en lugar de 4/8 bytes).          
  2. Indexación Estratégica para el Feed de Descubrimiento (Tinder-style):                                                                     
      • idx_users_location ([latitude, longitude]): Acelera las búsquedas por radio de proximidad geográfica (usando fórmulas Haversine o      
      extensiones PostGIS).                                                                                                                    
      • idx_users_gender_vip ([genderIdentity, isVip]): Optimiza la priorización en el feed de perfiles VIP sobre perfiles estándar según el   
      género objetivo.                                                                                                                         
      • idx_swipes_to_user_type ([toUserId, type]): Optimiza la consulta "¿Quién me dio Like/Superlike?" sin recorrer la tabla completa.       
      • idx_swipes_from_user_created ([fromUserId, createdAt]): Optimiza la exclusión rápida de perfiles que el usuario actual ya evaluó (Likes
      o Dislikes).                                                                                                                             
  3. Integridad de Datos y Restricciones Únicas:                                                                                               
      • @@unique([fromUserId, toUserId]) en Swipe: Garantiza a nivel de base de datos que un usuario no pueda deslizar dos veces sobre la misma
      persona.                                                                                                                                 
      • @@unique([userAId, userBId]) en Match: Previene duplicidad en los registros de emparejamientos.                                        
      • @@unique([userId, orderIndex]) en UserPhoto: Asegura que el carrusel de fotos mantenga un orden estricto sin colisiones de índice.     
      • telegramPaymentChargeId único en StarTransaction: Idempotencia total para callbacks de pagos con Telegram Stars.                       
  4. Borrado en Cascada (onDelete: Cascade):                                                                                                   
      • Al eliminar una cuenta de usuario (User), se limpian automáticamente sus fotos, preferencias, historial de swipes, matches y registros 
      de transacciones para cumplir con normativas de privacidad (GDPR).  
  ──────                                                                                                                                       
  ### 1. Controlador: src/controllers/swipeController.js                                                                                       
                                                                                                                                               
  Guarda y organiza la lógica de negocio para swipeController.js:22-149 y swipeController.js:156-294
    ──────                                                                                                                                       
  ### 2. Rutas: src/routes/swipeRoutes.js                                                                                                      
                                                                                                                                               
  Configuración de las rutas protegidas por telegramAuth.js:
    ──────                                                                                                                                       
  ### 3. Enrutador Principal: src/routes/index.js
    ──────                                                                                                                                       
  ### ⚡ Características y Garantías Arquitectónicas                                                                                           
                                                                                                                                               
  1. Garantía ACID con prisma.$transaction:                                                                                                    
  El registro del Swipe y la creación del Match ocurren en el mismo bloque transaccional. Si ocurre un fallo de red o error de integridad, la  
  operación hace rollback automático, impidiendo estados inconsistentes ("falsos matches").                                                    
  2. Prevención de Deadlocks y Duplicados (Deterministic ID Ordering):                                                                         
  Al ordenar [userAId, userBId] = [id1, id2].sort(), se garantiza que si dos usuarios se dan swipe simultáneamente en microsegundos exactos,   
  ambos intentan insertar con la misma combinación ordenada de claves en uq_user_a_user_b_match, evitando registros cruzados invertidos.       
  3. Optimización de Consultas SQL:                                                                                                            
      • La exclusión de perfiles utiliza el índice [fromUserId, createdAt] en swipes.                                                          
      • La priorización del feed utiliza el índice compuesto [genderIdentity, isVip] y ordenamiento por isVip: desc para monetización premium.

  ──────                                                                                                                                       
  Aquí tienes el módulo de pagos con Telegram Stars (XTR) para Node.js y Express, diseñado siguiendo las especificaciones oficiales de la      
  Telegram Bot API y Telegram Mini Apps.                                                                                                       
  ──────                                                                                                                                       
  ### 🏗️ Flujo de Pago con Telegram Stars                                                                                                      
                                                                                                                                               
    sequenceDiagram                                                                                                                            
        autonumber                                                                                                                             
        actor User as Usuario (Mini App)                                                                                                       
        participant Client as Frontend (TMA SDK)                                                                                               
        participant Backend as Backend Express                                                                                                 
        participant TG as Telegram Bot API                                                                                                     
                                                                                                                                               
        User->>Client: Presiona "Comprar VIP (250 ⭐)"                                                                                         
        Client->>Backend: POST /api/stars/create-invoice-link { itemType: 'VIP_MONTHLY' } (Auth: tma initData)                                 
        Backend->>TG: POST /createInvoiceLink (currency: 'XTR', payload firmado, prices: [250])                                                
        TG-->>Backend: Devuelve invoiceLink (https://t.me/$...)                                                                                
        Backend-->>Client: { invoiceLink: "https://t.me/$..." }                                                                                
        Client->>TG: Telegram.WebApp.openInvoice(invoiceLink, callback)                                                                        
        TG->>User: Muestra modal nativo de pago con Stars ⭐                                                                                   
        User->>TG: Confirma pago con sus Telegram Stars                                                                                        
        TG->>Backend: POST /api/stars/webhook { update: pre_checkout_query }                                                                   
        Backend->>TG: POST /answerPreCheckoutQuery { ok: true } (dentro de 10s)                                                                
        TG->>Backend: POST /api/stars/webhook { message: { successful_payment: {...} } }                                                       
        Backend->>Backend: Prisma: Upsert StarTransaction & Actualizar User (isVip: true, +30 días)                                            
        Backend->>TG: POST /sendMessage (Notificación de confirmación al chat)                                                                 
        TG-->>Client: callback status: 'paid'                                                                                                  
        Client->>User: Muestra pantalla de éxito / Insignia VIP activa                                                                         
  ──────                                                                                                                                       
  ### 1. Catálogo de Productos: src/config/starsProducts.js                                                                                    
                                                                                                                                               
  Centraliza los artículos disponibles en la aplicación y sus precios en Stars:                                                                
    ──────                                                                                                                                       
  ### 2. Servicio de Telegram Bot: src/services/telegramBotService.js                                                                          
                                                                                                                                               
  Maneja las llamadas HTTP a la API de Telegram y la firma criptográfica del payload con HMAC-SHA256 para evitar alteraciones de pedidos:
    ──────                                                                                                                                       
  ### 3. Controlador de Stars: src/controllers/starsController.js                                                                              
                                                                                                                                               
  Implementa starsController.js:14-80 y el webhook starsController.js:86-208:
    ──────                                                                                                                                       
  ### 4. Rutas: src/routes/starsRoutes.js
    ──────                                                                                                                                       
  ### 📱 Consumo desde el Frontend (Telegram Mini App SDK)                                                                                     
                                                                                                                                               
  En tu cliente web frontend (React, Vue, Vanilla JS):

  ──────
  ### 🛡️ Medidas de Seguridad Implementadas
  
  1. Idempotencia Garantizada: El campo telegram_payment_charge_id con restricción @unique en StarTransaction evita compras duplicadas si      
  Telegram reintenta el webhook.
  2. Payload Anti-Tampering (HMAC-SHA256): El payload se firma digitalmente con el TELEGRAM_BOT_TOKEN. Cualquier intento de modificar el userId
  o el itemType en el cliente es rechazado automáticamente en verifySignedPayload.
  3. Acumulación de Membresía VIP: Si un usuario VIP renueva antes de que termine su mes, los nuevos 30 días se suman a su fecha de expiración 
  actual (vipExpiresAt) sin perder los días restantes.
Resume with -c (or command below):
agy --conversation=9b1fcd99-7687-43f9-97d6-119a4cace047
