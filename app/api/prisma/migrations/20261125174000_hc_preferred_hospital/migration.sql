-- HC-01A.2B: Hospital preferido por medico.
-- Migracion aditiva compatible con afiliaciones existentes.

ALTER TABLE "HealthcareDoctorHospitalAffiliation"
ADD COLUMN "isPreferred" BOOLEAN NOT NULL DEFAULT FALSE;

-- Una sola afiliacion preferida por medico y empresa.
CREATE UNIQUE INDEX "HC_Affiliation_company_doctor_preferred_uidx"
ON "HealthcareDoctorHospitalAffiliation" ("companyId", "doctorId")
WHERE "isPreferred" = TRUE;
