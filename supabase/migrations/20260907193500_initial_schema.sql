


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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."materias_usuario" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "creditos" numeric,
    "semestre" integer,
    "estado" "text",
    "calificacion" numeric,
    "periodo" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."materias_usuario" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."preferencias_usuario" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tipo_periodo" "text",
    "max_materias" integer,
    "min_materias" integer,
    "parametros_extra" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."preferencias_usuario" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recomendaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "resultado" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."recomendaciones" OWNER TO "postgres";


ALTER TABLE ONLY "public"."materias_usuario"
    ADD CONSTRAINT "materias_usuario_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."preferencias_usuario"
    ADD CONSTRAINT "preferencias_usuario_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."preferencias_usuario"
    ADD CONSTRAINT "preferencias_usuario_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."recomendaciones"
    ADD CONSTRAINT "recomendaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."materias_usuario"
    ADD CONSTRAINT "materias_usuario_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."preferencias_usuario"
    ADD CONSTRAINT "preferencias_usuario_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."recomendaciones"
    ADD CONSTRAINT "recomendaciones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Usuarios insertan sus propias recomendaciones" ON "public"."recomendaciones" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuarios ven sus propias recomendaciones" ON "public"."recomendaciones" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "delete_own_materias" ON "public"."materias_usuario" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "insert_own_materias" ON "public"."materias_usuario" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "insert_own_preferencias" ON "public"."preferencias_usuario" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."materias_usuario" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."preferencias_usuario" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recomendaciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select_own_materias" ON "public"."materias_usuario" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "select_own_preferencias" ON "public"."preferencias_usuario" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "update_own_materias" ON "public"."materias_usuario" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "update_own_preferencias" ON "public"."preferencias_usuario" FOR UPDATE USING (("auth"."uid"() = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."materias_usuario" TO "anon";
GRANT ALL ON TABLE "public"."materias_usuario" TO "authenticated";
GRANT ALL ON TABLE "public"."materias_usuario" TO "service_role";



GRANT ALL ON TABLE "public"."preferencias_usuario" TO "anon";
GRANT ALL ON TABLE "public"."preferencias_usuario" TO "authenticated";
GRANT ALL ON TABLE "public"."preferencias_usuario" TO "service_role";



GRANT ALL ON TABLE "public"."recomendaciones" TO "anon";
GRANT ALL ON TABLE "public"."recomendaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."recomendaciones" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







