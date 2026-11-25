-- Zaping HC-01A.2A: smoke test de integridad con datos totalmente sinteticos.
-- SOLO ejecutar en el contenedor desechable zaping-hc01a2-test-pg.
-- Toda la prueba ocurre en una transaccion que termina con ROLLBACK.
-- SQL directo: @updatedAt es gestionado por Prisma Client, por eso cada INSERT
-- incluye "updatedAt" = CURRENT_TIMESTAMP explicitamente.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '15s';

-- Abortamos si alguien intenta usar una base con datos existentes.
DO $precondition$
BEGIN
  IF (SELECT COUNT(*) FROM "Company") <> 0
     OR (SELECT COUNT(*) FROM "Customer") <> 0
     OR (SELECT COUNT(*) FROM "HealthcareCase") <> 0
     OR (SELECT COUNT(*) FROM "HealthcareDoctor") <> 0
     OR (SELECT COUNT(*) FROM "HealthcareHospital") <> 0
     OR (SELECT COUNT(*) FROM "User") <> 0 THEN
    RAISE EXCEPTION 'ABORTADO: esta base no esta vacia';
  END IF;
END
$precondition$;

INSERT INTO "Company" ("id", "name", "rfc", "updatedAt") VALUES
('10000000-0000-4000-8000-000000000001', 'HC01A2 empresa A', 'HCAT261125AA1', CURRENT_TIMESTAMP),
('10000000-0000-4000-8000-000000000002', 'HC01A2 empresa B', 'HCBT261125BB2', CURRENT_TIMESTAMP);

INSERT INTO "Customer" ("id", "companyId", "name", "type", "updatedAt") VALUES
('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Medico cliente sintetico', 'DOCTOR', CURRENT_TIMESTAMP),
('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Hospital cliente sintetico', 'HOSPITAL', CURRENT_TIMESTAMP),
('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'Cliente otra empresa', 'DOCTOR', CURRENT_TIMESTAMP);

INSERT INTO "User" ("id", "companyId", "firstName", "lastName", "email", "passwordHash", "role", "updatedAt") VALUES
('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
 'QA', 'Sintetico', 'hc01a2-integration@example.invalid', 'not-a-real-password-hash', 'SALES', CURRENT_TIMESTAMP);

INSERT INTO "HealthcareDoctor" ("id", "companyId", "customerId", "firstName", "lastName", "specialty", "searchKey", "updatedAt") VALUES
('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001', 'Doctor', 'Prueba', 'Artroscopia', 'doctor prueba artroscopia', CURRENT_TIMESTAMP);

INSERT INTO "HealthcareHospital" ("id", "companyId", "customerId", "name", "city", "state", "searchKey", "updatedAt") VALUES
('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000002', 'Hospital Sede A', 'Hermosillo', 'Sonora', 'hospital sede a', CURRENT_TIMESTAMP),
('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000002', 'Hospital Sede B', 'Hermosillo', 'Sonora', 'hospital sede b', CURRENT_TIMESTAMP);

INSERT INTO "HealthcareCase" ("id", "companyId", "folio", "title", "createdById", "customerId", "doctorId", "hospitalId", "updatedAt") VALUES
('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
 'HC-01A2-HIST', 'Caso historico sin cliente', '30000000-0000-4000-8000-000000000001', NULL, NULL, NULL, CURRENT_TIMESTAMP),
('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
 'HC-01A2-COM', 'Caso integrado', '30000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000001', CURRENT_TIMESTAMP);

DO $tests$
BEGIN
  IF (SELECT COUNT(*) FROM "HealthcareHospital" WHERE "customerId" = '20000000-0000-4000-8000-000000000002') <> 2 THEN
    RAISE EXCEPTION 'FAIL: cliente hospital con dos sedes';
  END IF;
  RAISE NOTICE 'PASS: dos sedes del mismo cliente institucional';

  IF (SELECT COUNT(*) FROM "HealthcareCase" WHERE "customerId" IS NULL) <> 1 THEN
    RAISE EXCEPTION 'FAIL: casos historicos con cliente nullable';
  END IF;
  RAISE NOTICE 'PASS: caso historico con customerId NULL';

  IF (SELECT COUNT(*) FROM "HealthcareCase" WHERE "doctorId" IS NOT NULL AND "hospitalId" IS NOT NULL AND "customerId" IS NOT NULL) <> 1 THEN
    RAISE EXCEPTION 'FAIL: caso integrado';
  END IF;
  RAISE NOTICE 'PASS: caso integrado con cliente, medico y sede';

  BEGIN
    INSERT INTO "HealthcareDoctor" ("id", "companyId", "customerId", "firstName", "lastName", "specialty", "searchKey", "updatedAt") VALUES
('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000001', 'Segundo', 'Doctor', 'Prueba', 'segundo doctor', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'FAIL: doble perfil medico no fue rechazado';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: cliente no admite dos perfiles medicos';
  END;

  BEGIN
    INSERT INTO "HealthcareDoctor" ("id", "companyId", "customerId", "firstName", "lastName", "specialty", "searchKey", "updatedAt") VALUES
('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000003', 'Ajeno', 'Doctor', 'Prueba', 'doctor ajeno', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'FAIL: cruce entre empresas medico/cliente no fue rechazado';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: FK impide cliente de otra empresa en medico';
  END;

  BEGIN
    INSERT INTO "HealthcareHospital" ("id", "companyId", "customerId", "name", "city", "state", "searchKey", "updatedAt") VALUES
('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000003', 'Sede ajena', 'Hermosillo', 'Sonora', 'sede ajena', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'FAIL: cruce entre empresas hospital/cliente no fue rechazado';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: FK impide cliente de otra empresa en sede';
  END;

  BEGIN
    INSERT INTO "HealthcareCase" ("id", "companyId", "folio", "title", "createdById", "customerId", "updatedAt") VALUES
('60000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
            'HC-01A2-CROSS', 'Caso cross tenant', '30000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000003', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'FAIL: cruce entre empresas caso/cliente no fue rechazado';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: FK impide cliente de otra empresa en caso';
  END;
END
$tests$;

ROLLBACK;
\echo 'PASS: pruebas terminadas; ROLLBACK ejecutado, no se guardaron datos.'
