import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { validateSpaceData } from "@/lib/validators";
import {
  resolveSpaceImageUrl,
  resolveSpaceThumbnailUrl,
} from "@/lib/s3/storage.service";
import { PricingModel, Prisma, Role } from "@prisma/client";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const minCapacity = searchParams.get("minCapacity");
    const maxPrice = searchParams.get("maxPrice");
    const includeInactive = searchParams.get("includeInactive") === "true";

    const session = await getServerSession();
    const isAdmin = session?.role === Role.ADMIN;

    const whereClause: Prisma.SpaceWhereInput = {};

    if (!isAdmin || !includeInactive) {
      whereClause.isActive = true;
    }

    if (type && type.trim() !== "") {
      whereClause.type = {
        equals: type.trim(),
        mode: "insensitive",
      };
    }

    if (minCapacity && !isNaN(Number(minCapacity))) {
      whereClause.capacity = {
        gte: parseInt(minCapacity, 10),
      };
    }

    if (maxPrice && !isNaN(Number(maxPrice))) {
      const maxPriceNum = parseFloat(maxPrice);
      whereClause.OR = [
        {
          pricingModel: { in: [PricingModel.PER_SPACE, PricingModel.BOTH] },
          pricePerHour: { lte: maxPriceNum },
        },
        {
          pricingModel: PricingModel.PER_PERSON,
          pricePerPerson: { lte: maxPriceNum },
        },
      ];
    }

    const rawSpaces = await prisma.space.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    const spaces = await Promise.all(
      rawSpaces.map(async (space) => ({
        ...space,
        imageUrl: await resolveSpaceThumbnailUrl(space.imageUrl),
      }))
    );

    return NextResponse.json({ spaces }, { status: 200 });
  } catch (error) {
    console.error("Error en GET /api/spaces:", error);
    return NextResponse.json(
      { error: "Error al obtener el catálogo de espacios." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession();

    if (!session || session.role !== Role.ADMIN) {
      return NextResponse.json(
        { error: "Acceso denegado. Se requieren permisos de Administrador." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = validateSpaceData(body);

    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const pricingModel: PricingModel = body.pricingModel ?? PricingModel.PER_SPACE;
    const pricePerHour =
      pricingModel === PricingModel.PER_PERSON
        ? Number(body.pricePerHour) > 0
          ? Number(body.pricePerHour)
          : 0
        : Number(body.pricePerHour);
    const pricePerPerson =
      pricingModel === PricingModel.PER_SPACE
        ? null
        : Number(body.pricePerPerson);

    const newSpace = await prisma.space.create({
      data: {
        name: body.name.trim(),
        description: body.description.trim(),
        type: body.type.trim(),
        capacity: Number(body.capacity),
        pricingModel,
        pricePerHour,
        pricePerPerson,
        imageUrl: body.imageUrl.trim(),
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json(
      {
        message: "Espacio creado exitosamente.",
        space: {
          ...newSpace,
          imageUrl: await resolveSpaceImageUrl(newSpace.imageUrl),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en POST /api/spaces:", error);
    return NextResponse.json(
      { error: "Error interno al crear el espacio." },
      { status: 500 }
    );
  }
}
