import { HealthcareCaseReconciliationModule } from './healthcare/case-reconciliations/healthcare-case-reconciliations.module';
import { HealthcareCaseDispatchModule } from './healthcare/case-dispatches/healthcare-case-dispatches.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { CompaniesModule } from './companies/companies.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { QuotesModule } from './quotes/quotes.module';
import { PurchasesModule } from './purchases/purchases.module';
import { SalesModule } from './sales/sales.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { SupplierDocumentsModule } from './supplier-documents/supplier-documents.module';
import { CategoriesModule } from './categories/categories.module';
import { UsersModule } from './users/users.module';
import { PurchaseReceiptsModule } from './purchases-receipts/purchases-receipts.module';
import { EquipmentModule } from './equipment/equipment.module';
import { HealthcareCasesModule } from './healthcare/cases/healthcare-cases.module';
import { HealthcareDoctorHospitalAffiliationsModule } from './healthcare/doctor-hospital-affiliations/healthcare-doctor-hospital-affiliations.module';
import { HealthcareDoctorsModule } from './healthcare/doctors/healthcare-doctors.module';
import { HealthcareHospitalsModule } from './healthcare/hospitals/healthcare-hospitals.module';
import { HealthcareRequirementsModule } from './healthcare/requirements/healthcare-requirements.module';
import { HealthcareEquipmentAssignmentsModule } from './healthcare/equipment-assignments/healthcare-equipment-assignments.module';
import { HealthcareCaseKitsModule } from './healthcare/case-kits/healthcare-case-kits.module';
import { HealthcareCaseAvailabilityModule } from './healthcare/case-availability/healthcare-case-availability.module';
import { HealthModule } from './health/health.module';
import { ZapingFilesModule } from './zaping-files/zaping-files.module';
import { PrismaModule } from './prisma/prisma.module';
import { validateEnvironment } from './config/env.validation';
import { healthcareCompanyTransactionTimeoutConfiguration } from './healthcare/common/healthcare-company-transaction-timeout.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [healthcareCompanyTransactionTimeoutConfiguration],
      validate: validateEnvironment,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    CustomersModule,
    ProductsModule,
    InventoryModule,
    CompaniesModule,
    DashboardModule,
    QuotesModule,
    PurchasesModule,
    PurchaseReceiptsModule,
    ZapingFilesModule,
    SalesModule,
    SuppliersModule,
    SupplierDocumentsModule,
    CategoriesModule,
    UsersModule,
    EquipmentModule,
    HealthcareCasesModule,
    HealthcareDoctorHospitalAffiliationsModule,
    HealthcareDoctorsModule,
    HealthcareHospitalsModule,
    HealthcareRequirementsModule,
    HealthcareEquipmentAssignmentsModule,
    HealthcareCaseKitsModule,
    HealthcareCaseAvailabilityModule,
    HealthcareCaseDispatchModule,
    HealthcareCaseReconciliationModule,
  ],
})
export class AppModule {}
