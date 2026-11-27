-- HC-01A.2B - Pruebas manuales de hospital preferido.
-- SOLO ejecutar en hc_preferred_test, en el contenedor temporal de Zaping.
-- Las inserciones se revierten al final mediante ROLLBACK.

BEGIN;

DO $test$
DECLARE
  company_a CONSTANT text := 'hc-01a2b-test-company-a';
  company_b CONSTANT text := 'hc-01a2b-test-company-b';
  doctor_a  CONSTANT text := 'hc-01a2b-test-doctor-a';
  doctor_b  CONSTANT text := 'hc-01a2b-test-doctor-b';
  hospital_a1 CONSTANT text := 'hc-01a2b-test-hospital-a1';
  hospital_a2 CONSTANT text := 'hc-01a2b-test-hospital-a2';
  hospital_b1 CONSTANT text := 'hc-01a2b-test-hospital-b1';
  aff_a1 CONSTANT text := 'hc-01a2b-test-affiliation-a1';
  aff_a2 CONSTANT text := 'hc-01a2b-test-affiliation-a2';
  aff_b1 CONSTANT text := 'hc-01a2b-test-affiliation-b1';
  duplicate_blocked boolean := false;
BEGIN
  IF current_database() <> 'hc_preferred_test' THEN
    RAISE EXCEPTION 'BLOQUEADO: base inesperada: %', current_database();
  END IF;

  INSERT INTO "Company" ("id", "name", "rfc", "updatedAt") VALUES
    (company_a, 'HC-01A.2B Empresa A', 'HC2BTESTA', now()),
    (company_b, 'HC-01A.2B Empresa B', 'HC2BTESTB', now());

  INSERT INTO "HealthcareDoctor"
    ("id", "companyId", "firstName", "lastName", "specialty", "searchKey", "updatedAt") VALUES
    (doctor_a, company_a, 'Prueba', 'Medico A', 'Cirugia', 'prueba medico a', now()),
    (doctor_b, company_b, 'Prueba', 'Medico B', 'Cirugia', 'prueba medico b', now());

  INSERT INTO "HealthcareHospital"
    ("id", "companyId", "name", "city", "state", "searchKey", "updatedAt") VALUES
    (hospital_a1, company_a, 'Hospital A1', 'Hermosillo', 'Sonora', 'hospital a1', now()),
    (hospital_a2, company_a, 'Hospital A2', 'Hermosillo', 'Sonora', 'hospital a2', now()),
    (hospital_b1, company_b, 'Hospital B1', 'Nogales', 'Sonora', 'hospital b1', now());

  INSERT INTO "HealthcareDoctorHospitalAffiliation"
    ("id", "companyId", "doctorId", "hospitalId", "updatedAt") VALUES
    (aff_a1, company_a, doctor_a, hospital_a1, now()),
    (aff_a2, company_a, doctor_a, hospital_a2, now()),
    (aff_b1, company_b, doctor_b, hospital_b1, now());

  IF (SELECT count(*) FROM "HealthcareDoctorHospitalAffiliation"
      WHERE "id" IN (aff_a1, aff_a2, aff_b1) AND "isPreferred") <> 0 THEN
    RAISE EXCEPTION 'FAIL: las nuevas afiliaciones no inician en false';
  END IF;
  RAISE NOTICE 'PASS 1/5: valor predeterminado isPreferred=false';

  UPDATE "HealthcareDoctorHospitalAffiliation"
  SET "isPreferred" = true WHERE "id" = aff_a1;
  IF (SELECT count(*) FROM "HealthcareDoctorHospitalAffiliation"
      WHERE "companyId"=company_a AND "doctorId"=doctor_a AND "isPreferred") <> 1 THEN
    RAISE EXCEPTION 'FAIL: preferencia inicial de medico A';
  END IF;
  RAISE NOTICE 'PASS 2/5: primera sede preferida admitida';

  BEGIN
    UPDATE "HealthcareDoctorHospitalAffiliation"
    SET "isPreferred" = true WHERE "id" = aff_a2;
  EXCEPTION WHEN unique_violation THEN
    duplicate_blocked := true;
  END;
  IF NOT duplicate_blocked THEN
    RAISE EXCEPTION 'FAIL: dos hospitales preferidos fueron admitidos';
  END IF;
  RAISE NOTICE 'PASS 3/5: segunda preferencia del mismo medico bloqueada';

  UPDATE "HealthcareDoctorHospitalAffiliation"
  SET "isPreferred" = true WHERE "id" = aff_b1;
  IF (SELECT count(*) FROM "HealthcareDoctorHospitalAffiliation"
      WHERE "id"=aff_b1 AND "isPreferred") <> 1 THEN
    RAISE EXCEPTION 'FAIL: preferencia independiente de empresa B';
  END IF;
  RAISE NOTICE 'PASS 4/5: otra empresa mantiene su preferencia independiente';

  UPDATE "HealthcareDoctorHospitalAffiliation"
  SET "isPreferred" = false WHERE "id" = aff_a1;
  UPDATE "HealthcareDoctorHospitalAffiliation"
  SET "isPreferred" = true WHERE "id" = aff_a2;
  IF (SELECT count(*) FROM "HealthcareDoctorHospitalAffiliation"
      WHERE "companyId"=company_a AND "doctorId"=doctor_a AND "isPreferred") <> 1
     OR NOT EXISTS (SELECT 1 FROM "HealthcareDoctorHospitalAffiliation"
                    WHERE "id"=aff_a2 AND "isPreferred") THEN
    RAISE EXCEPTION 'FAIL: cambio de sede preferida';
  END IF;
  RAISE NOTICE 'PASS 5/5: cambio de sede preferida conservando unicidad';
END;
$test$;

ROLLBACK;
