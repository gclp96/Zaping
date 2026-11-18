import { HealthcareCaseReconciliationsController } from '../../healthcare/case-reconciliations/healthcare-case-reconciliations.controller';
import { HealthcareCaseDispatchesController } from '../../healthcare/case-dispatches/healthcare-case-dispatches.controller';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { InventoryMovementType, UserRole } from '@prisma/client';

import { AuthController } from '../auth.controller';
import { CompaniesController } from '../../companies/companies.controller';
import { CategoriesController } from '../../categories/categories.controller';
import { CustomersController } from '../../customers/customers.controller';
import { DashboardController } from '../../dashboard/dashboard.controller';
import { EquipmentController } from '../../equipment/equipment.controller';
import { InventoryController } from '../../inventory/inventory.controller';
import { HealthcareCasesController } from '../../healthcare/cases/healthcare-cases.controller';
import { HealthcareDoctorHospitalAffiliationsController } from '../../healthcare/doctor-hospital-affiliations/healthcare-doctor-hospital-affiliations.controller';
import { HealthcareDoctorsController } from '../../healthcare/doctors/healthcare-doctors.controller';
import { HealthcareHospitalsController } from '../../healthcare/hospitals/healthcare-hospitals.controller';
import { HealthcareRequirementsController } from '../../healthcare/requirements/healthcare-requirements.controller';
import { HealthcareEquipmentAssignmentsController } from '../../healthcare/equipment-assignments/healthcare-equipment-assignments.controller';
import { ProductsController } from '../../products/products.controller';
import { PurchaseReceiptsController } from '../../purchases-receipts/purchases-receipts.controller';
import { PurchasesController } from '../../purchases/purchases.controller';
import { QuotesController } from '../../quotes/quotes.controller';
import { SalesController } from '../../sales/sales.controller';
import { SuppliersController } from '../../suppliers/suppliers.controller';
import { SupplierDocumentsController } from '../../supplier-documents/supplier-documents.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guards';

jest.mock('../../email/email.service', () => ({
  EmailService: class EmailService {},
}));

type ControllerClass = {
  prototype: object;
};

type RoleMatrix = {
  controller: ControllerClass;
  methods: Record<string, UserRole[]>;
};

const allRoles = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.SALES,
  UserRole.WAREHOUSE,
];

const roleMatrix: RoleMatrix[] = [
  {
    controller: SupplierDocumentsController,
    methods: {
      findAll: [UserRole.ADMIN, UserRole.MANAGER],
      findOne: [UserRole.ADMIN, UserRole.MANAGER],
      create: [UserRole.ADMIN, UserRole.MANAGER],
      createException: [UserRole.ADMIN, UserRole.MANAGER],
      confirmBasis: [UserRole.ADMIN, UserRole.MANAGER],
      listAllocations: [UserRole.ADMIN, UserRole.MANAGER],
      allocate: [UserRole.ADMIN, UserRole.MANAGER],
      reviseAllocation: [UserRole.ADMIN, UserRole.MANAGER],
      correctBasis: [UserRole.ADMIN, UserRole.MANAGER],
      cancelDocument: [UserRole.ADMIN, UserRole.MANAGER],
      receiptReconciliation: [UserRole.ADMIN, UserRole.MANAGER],
      approveVariance: [UserRole.ADMIN, UserRole.MANAGER],
    },
  },
  {
    controller: HealthcareCaseReconciliationsController,
    methods: {
      list: allRoles,
      detail: allRoles,
      summary: allRoles,
      create: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      addItem: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      setOutcome: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      excludeItem: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      cancel: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      confirm: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
    },
  },
  {
    controller: HealthcareCaseDispatchesController,
    methods: {
      list: allRoles,
      detail: allRoles,
      create: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      setCustodian: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      addItem: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      excludeItem: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      cancel: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
    },
  },
  {
    controller: CustomersController,
    methods: {
      findAll: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      findOne: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      getOverview: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      create: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      update: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      remove: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
    },
  },
  {
    controller: SuppliersController,
    methods: {
      findAll: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      findOne: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      create: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      update: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      remove: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
    },
  },
  {
    controller: CategoriesController,
    methods: {
      findAll: allRoles,
      findOne: allRoles,
      create: [UserRole.ADMIN, UserRole.MANAGER],
      update: [UserRole.ADMIN, UserRole.MANAGER],
      remove: [UserRole.ADMIN, UserRole.MANAGER],
    },
  },
  {
    controller: ProductsController,
    methods: {
      findAll: allRoles,
      findLowStock: allRoles,
      findOne: allRoles,
      create: [UserRole.ADMIN, UserRole.MANAGER],
      update: [UserRole.ADMIN, UserRole.MANAGER],
      remove: [UserRole.ADMIN, UserRole.MANAGER],
    },
  },
  {
    controller: DashboardController,
    methods: {
      getDashboard: allRoles,
      getRecentActivity: allRoles,
    },
  },
  {
    controller: InventoryController,
    methods: {
      findInventory: allRoles,
      findMovements: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      createMovement: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
    },
  },
  {
    controller: PurchasesController,
    methods: {
      findAll: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      findOne: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      findInventoryMovements: [
        UserRole.ADMIN,
        UserRole.MANAGER,
        UserRole.WAREHOUSE,
      ],
      generatePDF: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      create: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      update: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      approve: [UserRole.ADMIN, UserRole.MANAGER],
      cancel: [UserRole.ADMIN, UserRole.MANAGER],
    },
  },
  {
    controller: PurchaseReceiptsController,
    methods: {
      getCapabilities: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      findAll: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      findByPurchase: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      findOne: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      create: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
    },
  },
  {
    controller: QuotesController,
    methods: {
      findAll: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      generatePdf: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      create: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      approve: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      cancel: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
    },
  },
  {
    controller: SalesController,
    methods: {
      findAll: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      findOne: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      getPdf: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      create: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      createFromQuote: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      approve: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      cancel: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
    },
  },
  {
    controller: EquipmentController,
    methods: {
      findAll: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      findInspections: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      availability: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      findOne: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      create: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      createInspection: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      retire: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
    },
  },
  {
    controller: HealthcareCasesController,
    methods: {
      create: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      findAll: allRoles,
      findUpcoming: allRoles,
      update: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      cancel: [UserRole.ADMIN, UserRole.MANAGER],
      findOne: allRoles,
    },
  },
  {
    controller: HealthcareDoctorHospitalAffiliationsController,
    methods: {
      create: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      update: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      deactivate: [UserRole.ADMIN, UserRole.MANAGER],
      reactivate: [UserRole.ADMIN, UserRole.MANAGER],
    },
  },
  {
    controller: HealthcareDoctorsController,
    methods: {
      findAll: allRoles,
      create: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      findOne: allRoles,
      findHospitals: allRoles,
      update: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      deactivate: [UserRole.ADMIN, UserRole.MANAGER],
      reactivate: [UserRole.ADMIN, UserRole.MANAGER],
    },
  },
  {
    controller: HealthcareHospitalsController,
    methods: {
      findAll: allRoles,
      create: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      findOne: allRoles,
      findDoctors: allRoles,
      update: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES],
      deactivate: [UserRole.ADMIN, UserRole.MANAGER],
      reactivate: [UserRole.ADMIN, UserRole.MANAGER],
    },
  },
  {
    controller: HealthcareRequirementsController,
    methods: {
      findAllForCase: allRoles,
      create: allRoles,
      reorder: allRoles,
      findOne: allRoles,
      update: allRoles,
      retire: allRoles,
      reactivate: allRoles,
    },
  },
  {
    controller: HealthcareEquipmentAssignmentsController,
    methods: {
      findAll: allRoles,
      findOne: allRoles,
      create: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      release: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
      replace: [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE],
    },
  },
];

function getHandler(controller: ControllerClass, methodName: string): object {
  const descriptor = Object.getOwnPropertyDescriptor(
    controller.prototype,
    methodName,
  );

  if (!descriptor?.value) {
    throw new Error(`Missing ${methodName} handler`);
  }

  return descriptor.value as object;
}

function getEffectiveRoles(
  controller: ControllerClass,
  methodName: string,
): UserRole[] | undefined {
  const handler = getHandler(controller, methodName);

  return (Reflect.getMetadata('roles', handler) ??
    Reflect.getMetadata('roles', controller)) as UserRole[] | undefined;
}

function buildRoleContext(
  controller: ControllerClass,
  methodName: string,
  role: UserRole,
): ExecutionContext {
  return {
    getHandler: () => getHandler(controller, methodName),
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({
        user: { role },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('ERP Core role matrix', () => {
  it.each(roleMatrix)(
    'protects $controller.name with JwtAuthGuard and RolesGuard',
    ({ controller, methods }) => {
      const firstMethod = Object.keys(methods)[0];
      const guards = (Reflect.getMetadata(GUARDS_METADATA, controller) ??
        Reflect.getMetadata(
          GUARDS_METADATA,
          getHandler(controller, firstMethod),
        )) as unknown;

      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    },
  );

  it.each(roleMatrix)(
    'declares the approved roles for $controller.name',
    ({ controller, methods }) => {
      for (const [methodName, expectedRoles] of Object.entries(methods)) {
        expect(getEffectiveRoles(controller, methodName)).toEqual(
          expectedRoles,
        );
      }
    },
  );

  it('enforces representative role differences through RolesGuard', () => {
    const rolesGuard = new RolesGuard(new Reflector());

    expect(
      rolesGuard.canActivate(
        buildRoleContext(PurchasesController, 'create', UserRole.WAREHOUSE),
      ),
    ).toBe(true);
    expect(
      rolesGuard.canActivate(
        buildRoleContext(PurchasesController, 'approve', UserRole.WAREHOUSE),
      ),
    ).toBe(false);
    expect(
      rolesGuard.canActivate(
        buildRoleContext(PurchasesController, 'approve', UserRole.MANAGER),
      ),
    ).toBe(true);

    expect(
      rolesGuard.canActivate(
        buildRoleContext(SalesController, 'create', UserRole.WAREHOUSE),
      ),
    ).toBe(false);
    expect(
      rolesGuard.canActivate(
        buildRoleContext(SalesController, 'create', UserRole.SALES),
      ),
    ).toBe(true);

    expect(
      rolesGuard.canActivate(
        buildRoleContext(PurchaseReceiptsController, 'create', UserRole.SALES),
      ),
    ).toBe(false);
    expect(
      rolesGuard.canActivate(
        buildRoleContext(
          PurchaseReceiptsController,
          'create',
          UserRole.WAREHOUSE,
        ),
      ),
    ).toBe(true);

    expect(
      rolesGuard.canActivate(
        buildRoleContext(ProductsController, 'findAll', UserRole.WAREHOUSE),
      ),
    ).toBe(true);
    expect(
      rolesGuard.canActivate(
        buildRoleContext(ProductsController, 'create', UserRole.WAREHOUSE),
      ),
    ).toBe(false);

    expect(
      rolesGuard.canActivate(
        buildRoleContext(CustomersController, 'findAll', UserRole.WAREHOUSE),
      ),
    ).toBe(false);
    expect(
      rolesGuard.canActivate(
        buildRoleContext(CustomersController, 'findAll', UserRole.SALES),
      ),
    ).toBe(true);
  });

  it('keeps Inventory ADJUSTMENT restricted to ADMIN and MANAGER', async () => {
    const inventoryServiceMock = {
      createMovement: jest.fn().mockResolvedValue({ id: 'movement-1' }),
    };
    const controller = new InventoryController(inventoryServiceMock as never);
    const adjustment = {
      productId: 'product-1',
      movementType: InventoryMovementType.ADJUSTMENT,
      quantity: 3,
    };

    expect(() =>
      controller.createMovement(
        { user: { companyId: 'company-1', role: UserRole.WAREHOUSE } },
        adjustment,
      ),
    ).toThrow(ForbiddenException);
    expect(inventoryServiceMock.createMovement).not.toHaveBeenCalled();

    await controller.createMovement(
      { user: { companyId: 'company-1', role: UserRole.ADMIN } },
      adjustment,
    );

    expect(inventoryServiceMock.createMovement).toHaveBeenCalledWith(
      'company-1',
      adjustment,
    );
  });

  it.each([
    [UserRole.ADMIN, true],
    [UserRole.MANAGER, true],
    [UserRole.WAREHOUSE, true],
    [UserRole.SALES, false],
  ])('enforces Inventory movement read access for %s', (role, allowed) => {
    const rolesGuard = new RolesGuard(new Reflector());

    expect(
      rolesGuard.canActivate(
        buildRoleContext(InventoryController, 'findMovements', role),
      ),
    ).toBe(allowed);
  });

  it('denies SALES Inventory movement mutations through RolesGuard', () => {
    const rolesGuard = new RolesGuard(new Reflector());

    expect(
      rolesGuard.canActivate(
        buildRoleContext(InventoryController, 'createMovement', UserRole.SALES),
      ),
    ).toBe(false);
  });

  it.each([
    [UserRole.ADMIN, true, true, true],
    [UserRole.MANAGER, true, true, true],
    [UserRole.SALES, true, true, false],
    [UserRole.WAREHOUSE, true, false, false],
  ])(
    'enforces Healthcare master-data access for %s',
    (role, canRead, canEdit, canManageLifecycle) => {
      const rolesGuard = new RolesGuard(new Reflector());

      for (const controller of [
        HealthcareDoctorsController,
        HealthcareHospitalsController,
      ]) {
        expect(
          rolesGuard.canActivate(buildRoleContext(controller, 'findAll', role)),
        ).toBe(canRead);
        expect(
          rolesGuard.canActivate(buildRoleContext(controller, 'findOne', role)),
        ).toBe(canRead);
        expect(
          rolesGuard.canActivate(buildRoleContext(controller, 'create', role)),
        ).toBe(canEdit);
        expect(
          rolesGuard.canActivate(buildRoleContext(controller, 'update', role)),
        ).toBe(canEdit);
        expect(
          rolesGuard.canActivate(
            buildRoleContext(controller, 'deactivate', role),
          ),
        ).toBe(canManageLifecycle);
        expect(
          rolesGuard.canActivate(
            buildRoleContext(controller, 'reactivate', role),
          ),
        ).toBe(canManageLifecycle);
      }
    },
  );

  it('keeps the authenticated context intact after a denied Healthcare mutation', () => {
    const rolesGuard = new RolesGuard(new Reflector());
    const request = {
      user: {
        id: 'user-1',
        companyId: 'company-1',
        role: UserRole.WAREHOUSE,
      },
    };
    const context = {
      getHandler: () => getHandler(HealthcareDoctorsController, 'create'),
      getClass: () => HealthcareDoctorsController,
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    expect(rolesGuard.canActivate(context)).toBe(false);
    expect(request).toEqual({
      user: {
        id: 'user-1',
        companyId: 'company-1',
        role: UserRole.WAREHOUSE,
      },
    });
  });

  it.each([
    [UserRole.ADMIN, true, true],
    [UserRole.MANAGER, true, true],
    [UserRole.SALES, true, false],
    [UserRole.WAREHOUSE, false, false],
  ])(
    'enforces Healthcare affiliation mutation access for %s',
    (role, canEdit, canManageLifecycle) => {
      const rolesGuard = new RolesGuard(new Reflector());

      expect(
        rolesGuard.canActivate(
          buildRoleContext(
            HealthcareDoctorHospitalAffiliationsController,
            'create',
            role,
          ),
        ),
      ).toBe(canEdit);
      expect(
        rolesGuard.canActivate(
          buildRoleContext(
            HealthcareDoctorHospitalAffiliationsController,
            'update',
            role,
          ),
        ),
      ).toBe(canEdit);
      expect(
        rolesGuard.canActivate(
          buildRoleContext(
            HealthcareDoctorHospitalAffiliationsController,
            'deactivate',
            role,
          ),
        ),
      ).toBe(canManageLifecycle);
      expect(
        rolesGuard.canActivate(
          buildRoleContext(
            HealthcareDoctorHospitalAffiliationsController,
            'reactivate',
            role,
          ),
        ),
      ).toBe(canManageLifecycle);
    },
  );

  it.each(allRoles)(
    'allows %s to read both Healthcare affiliation directions',
    (role) => {
      const rolesGuard = new RolesGuard(new Reflector());

      expect(
        rolesGuard.canActivate(
          buildRoleContext(HealthcareDoctorsController, 'findHospitals', role),
        ),
      ).toBe(true);
      expect(
        rolesGuard.canActivate(
          buildRoleContext(HealthcareHospitalsController, 'findDoctors', role),
        ),
      ).toBe(true);
    },
  );

  it.each([
    [UserRole.ADMIN, true],
    [UserRole.MANAGER, true],
    [UserRole.WAREHOUSE, true],
    [UserRole.SALES, false],
  ])(
    'enforces Equipment Assignment mutation access for %s',
    (role, canMutate) => {
      const rolesGuard = new RolesGuard(new Reflector());

      for (const methodName of ['create', 'release', 'replace']) {
        expect(
          rolesGuard.canActivate(
            buildRoleContext(
              HealthcareEquipmentAssignmentsController,
              methodName,
              role,
            ),
          ),
        ).toBe(canMutate);
      }
      expect(
        rolesGuard.canActivate(
          buildRoleContext(
            HealthcareEquipmentAssignmentsController,
            'findAll',
            role,
          ),
        ),
      ).toBe(true);
      expect(
        rolesGuard.canActivate(
          buildRoleContext(
            HealthcareEquipmentAssignmentsController,
            'findOne',
            role,
          ),
        ),
      ).toBe(true);
    },
  );

  it('denies SALES Equipment Assignment create without mutating auth context', () => {
    const rolesGuard = new RolesGuard(new Reflector());
    const request = {
      user: {
        id: 'user-1',
        companyId: 'company-1',
        role: UserRole.SALES,
      },
    };
    const context = {
      getHandler: () =>
        getHandler(HealthcareEquipmentAssignmentsController, 'create'),
      getClass: () => HealthcareEquipmentAssignmentsController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(rolesGuard.canActivate(context)).toBe(false);
    expect(request.user).toEqual({
      id: 'user-1',
      companyId: 'company-1',
      role: UserRole.SALES,
    });
  });

  it.each(allRoles)(
    'allows %s to use every Healthcare Requirements route',
    (role) => {
      const rolesGuard = new RolesGuard(new Reflector());

      for (const methodName of [
        'findAllForCase',
        'create',
        'reorder',
        'findOne',
        'update',
        'retire',
        'reactivate',
      ]) {
        expect(
          rolesGuard.canActivate(
            buildRoleContext(
              HealthcareRequirementsController,
              methodName,
              role,
            ),
          ),
        ).toBe(true);
      }
    },
  );

  it.each([
    [UserRole.ADMIN, true, true, true],
    [UserRole.MANAGER, true, true, true],
    [UserRole.SALES, true, true, false],
    [UserRole.WAREHOUSE, true, false, false],
  ])(
    'enforces Healthcare Case access for %s',
    (role, canRead, canEdit, canCancel) => {
      const rolesGuard = new RolesGuard(new Reflector());

      expect(
        rolesGuard.canActivate(
          buildRoleContext(HealthcareCasesController, 'findAll', role),
        ),
      ).toBe(canRead);
      expect(
        rolesGuard.canActivate(
          buildRoleContext(HealthcareCasesController, 'findOne', role),
        ),
      ).toBe(canRead);
      expect(
        rolesGuard.canActivate(
          buildRoleContext(HealthcareCasesController, 'create', role),
        ),
      ).toBe(canEdit);
      expect(
        rolesGuard.canActivate(
          buildRoleContext(HealthcareCasesController, 'update', role),
        ),
      ).toBe(canEdit);
      expect(
        rolesGuard.canActivate(
          buildRoleContext(HealthcareCasesController, 'cancel', role),
        ),
      ).toBe(canCancel);
    },
  );

  it.each(['create', 'update'] as const)(
    'denies WAREHOUSE Healthcare Case %s before business lookup',
    (methodName) => {
      const rolesGuard = new RolesGuard(new Reflector());
      const request = {
        user: {
          id: 'user-1',
          companyId: 'company-1',
          role: UserRole.WAREHOUSE,
        },
      };
      const businessLookup = jest.fn();
      const context = {
        getHandler: () => getHandler(HealthcareCasesController, methodName),
        getClass: () => HealthcareCasesController,
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      if (rolesGuard.canActivate(context)) {
        businessLookup();
      }

      expect(businessLookup).not.toHaveBeenCalled();
      expect(request.user).toEqual({
        id: 'user-1',
        companyId: 'company-1',
        role: UserRole.WAREHOUSE,
      });
    },
  );

  it.each([
    [UserRole.WAREHOUSE, 'create'],
    [UserRole.WAREHOUSE, 'update'],
    [UserRole.SALES, 'deactivate'],
    [UserRole.SALES, 'reactivate'],
  ] as const)(
    'denies %s on affiliation %s without mutating auth context',
    (role, methodName) => {
      const rolesGuard = new RolesGuard(new Reflector());
      const request = {
        user: {
          id: 'user-1',
          companyId: 'company-1',
          role,
        },
      };
      const context = {
        getHandler: () =>
          getHandler(
            HealthcareDoctorHospitalAffiliationsController,
            methodName,
          ),
        getClass: () => HealthcareDoctorHospitalAffiliationsController,
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as unknown as ExecutionContext;

      expect(rolesGuard.canActivate(context)).toBe(false);
      expect(request.user).toEqual({
        id: 'user-1',
        companyId: 'company-1',
        role,
      });
    },
  );
});

describe('public route regressions', () => {
  it('keeps register, login, forgot-password, and reset-password public', () => {
    for (const methodName of [
      'register',
      'login',
      'forgotPassword',
      'resetPassword',
    ]) {
      const handler = getHandler(AuthController, methodName);

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        ThrottlerGuard,
      ]);
    }
  });

  it('keeps authenticated auth routes protected without role restrictions', () => {
    for (const methodName of ['me', 'changePassword']) {
      const handler = getHandler(AuthController, methodName);

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        ...(methodName === 'changePassword' ? [ThrottlerGuard] : []),
        JwtAuthGuard,
      ]);
      expect(Reflect.getMetadata('roles', handler)).toBeUndefined();
    }
  });

  it('does not expose HTTP routes from the retired Companies controller', () => {
    const routeMethods = Object.getOwnPropertyNames(
      CompaniesController.prototype,
    )
      .filter((methodName) => methodName !== 'constructor')
      .filter((methodName) => {
        const descriptor = Object.getOwnPropertyDescriptor(
          CompaniesController.prototype,
          methodName,
        );

        const handler = descriptor?.value as object | undefined;

        return (
          handler && Reflect.getMetadata(METHOD_METADATA, handler) !== undefined
        );
      });

    expect(routeMethods).toEqual([]);
    expect(Reflect.getMetadata(PATH_METADATA, CompaniesController)).toBe(
      'companies',
    );
  });
});
