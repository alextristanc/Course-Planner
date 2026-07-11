SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


ALTER TABLE "public"."preferencias_usuario"
    ADD COLUMN "semestre_actual" integer,
    ADD COLUMN "limite_creditos" numeric,
    ADD COLUMN "horarios_no_disponibles" "jsonb" DEFAULT '[]'::"jsonb";


CREATE TABLE IF NOT EXISTS "public"."oferta_materias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "periodo" "text",
    "materia" "text" NOT NULL,
    "profesor" "text",
    "identificador" "text",
    "horario" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."oferta_materias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prioridades_grupos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "oferta_materia_id" "uuid" NOT NULL,
    "prioridad" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."prioridades_grupos" OWNER TO "postgres";


ALTER TABLE ONLY "public"."oferta_materias"
    ADD CONSTRAINT "oferta_materias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prioridades_grupos"
    ADD CONSTRAINT "prioridades_grupos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."oferta_materias"
    ADD CONSTRAINT "oferta_materias_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."prioridades_grupos"
    ADD CONSTRAINT "prioridades_grupos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."prioridades_grupos"
    ADD CONSTRAINT "prioridades_grupos_oferta_materia_id_fkey" FOREIGN KEY ("oferta_materia_id") REFERENCES "public"."oferta_materias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prioridades_grupos"
    ADD CONSTRAINT "prioridades_grupos_prioridad_check" CHECK (("prioridad" = ANY (ARRAY['alta'::"text", 'media'::"text", 'baja'::"text"])));



CREATE POLICY "select_own_oferta_materias" ON "public"."oferta_materias" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "insert_own_oferta_materias" ON "public"."oferta_materias" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "update_own_oferta_materias" ON "public"."oferta_materias" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "delete_own_oferta_materias" ON "public"."oferta_materias" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "select_own_prioridades_grupos" ON "public"."prioridades_grupos" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "insert_own_prioridades_grupos" ON "public"."prioridades_grupos" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "update_own_prioridades_grupos" ON "public"."prioridades_grupos" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "delete_own_prioridades_grupos" ON "public"."prioridades_grupos" FOR DELETE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."oferta_materias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prioridades_grupos" ENABLE ROW LEVEL SECURITY;



GRANT ALL ON TABLE "public"."oferta_materias" TO "anon";
GRANT ALL ON TABLE "public"."oferta_materias" TO "authenticated";
GRANT ALL ON TABLE "public"."oferta_materias" TO "service_role";



GRANT ALL ON TABLE "public"."prioridades_grupos" TO "anon";
GRANT ALL ON TABLE "public"."prioridades_grupos" TO "authenticated";
GRANT ALL ON TABLE "public"."prioridades_grupos" TO "service_role";