-- Migración para crear el bucket de storage 'documentos' y sus políticas RLS

-- Insertar el bucket 'documentos' si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documentos', 
    'documentos', 
    false, 
    52428800, -- 50MB
    ARRAY[
        'application/pdf', 
        'image/png', 
        'image/jpeg', 
        'image/jpg',
        'text/plain', 
        'text/csv', 
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
        'application/pdf', 
        'image/png', 
        'image/jpeg', 
        'image/jpg',
        'text/plain', 
        'text/csv', 
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream'
    ];

-- Habilitar RLS en storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas previas si existen
DROP POLICY IF EXISTS "Usuarios pueden subir sus propios documentos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden ver sus propios documentos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios pueden borrar sus propios documentos" ON storage.objects;

-- Crear políticas basadas en la carpeta principal que sea el ID de usuario auth.uid()
CREATE POLICY "Usuarios pueden subir sus propios documentos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'documentos' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Usuarios pueden ver sus propios documentos"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documentos' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Usuarios pueden borrar sus propios documentos"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'documentos' AND
    (storage.foldername(name))[1] = auth.uid()::text
);
