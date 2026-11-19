import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: string) {
    return this.prisma.product.findMany({
      where: {
        companyId,
        isActive: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(companyId: string, dto: CreateProductDto) {
    const existingProduct = await this.prisma.product.findFirst({
      where: {
        companyId,
        sku: dto.sku,
      },
    });

    if (dto.barcode) {
      const existingBarcode = await this.prisma.product.findFirst({
        where: {
          companyId,
          barcode: dto.barcode,
        },
      });

      if (existingBarcode) {
        throw new BadRequestException(
          'Ya existe un producto con el mismo código de barras en esta empresa',
        );
      }
    }

    if (existingProduct) {
      throw new BadRequestException(
        'Ya existe un producto con el mismo SKU en esta empresa',
      );
    }

    await this.validateCategory(companyId, dto.categoryId);

    return this.prisma.product.create({
      data: {
        companyId,
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        brand: dto.brand,
        categoryId: dto.categoryId,
        barcode: dto.barcode,
        ...(dto.unitOfMeasure !== undefined && {
          unitOfMeasure: dto.unitOfMeasure.trim() || null,
        }),
        cost: dto.cost,
        price: dto.price,
        minStock: dto.minStock,
        inventoryTracking: dto.inventoryTracking,
        lotTracking: dto.lotTracking,
      },
    });
  }

  async findOne(companyId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        companyId,
      },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return product;
  }

  async update(companyId: string, productId: string, dto: UpdateProductDto) {
    await this.findOne(companyId, productId);

    const existingProduct = await this.prisma.product.findFirst({
      where: {
        companyId,
        sku: dto.sku,
        NOT: {
          id: productId,
        },
      },
    });

    if (existingProduct) {
      throw new BadRequestException('Ya existe otro producto con ese SKU');
    }

    if (dto.barcode) {
      const existingBarcode = await this.prisma.product.findFirst({
        where: {
          companyId,
          barcode: dto.barcode,
          NOT: {
            id: productId,
          },
        },
      });

      if (existingBarcode) {
        throw new BadRequestException('Ese código de barras ya está en uso');
      }
    }

    await this.validateCategory(companyId, dto.categoryId);

    return this.prisma.product.update({
      where: {
        id_companyId: {
          id: productId,
          companyId,
        },
      },
      data: {
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        brand: dto.brand,
        categoryId: dto.categoryId,
        barcode: dto.barcode || null,
        ...(dto.unitOfMeasure !== undefined && {
          unitOfMeasure: dto.unitOfMeasure.trim() || null,
        }),
        cost: dto.cost,
        price: dto.price,
        minStock: dto.minStock,
      },
    });
  }

  async lowStock(companyId: string) {
    return this.prisma.product.findMany({
      where: {
        companyId,
        isActive: true,
        stock: {
          lte: this.prisma.product.fields.minStock,
        },
      },
    });
  }

  async remove(companyId: string, productId: string) {
    await this.findOne(companyId, productId);

    const updateResult = await this.prisma.product.updateMany({
      where: {
        id: productId,
        companyId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    if (updateResult.count === 0) {
      throw new NotFoundException('Producto no encontrado');
    }

    return this.findOne(companyId, productId);
  }

  private async validateCategory(
    companyId: string,
    categoryId?: string | null,
  ) {
    if (categoryId === undefined || categoryId === null) {
      return;
    }

    const category = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        companyId,
        isActive: true,
      },
    });

    if (!category) {
      throw new NotFoundException(
        'Categoría no encontrada, inactiva o fuera de la empresa',
      );
    }
  }
}
