import React, { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveSpaceImageUrl } from "@/lib/s3/storage.service";
import { SpaceDetailClient } from "@/components/spaces/SpaceDetailClient";
import { Space } from "@/types/space";

interface SpaceDetailPageProps {
  params: Promise<{ id: string }>;
}

async function SpaceDetailContent({ params }: SpaceDetailPageProps) {
  const { id } = await params;

  const space = await prisma.space.findUnique({
    where: { id },
  });

  if (!space) {
    notFound();
  }

  const resolvedImageUrl = await resolveSpaceImageUrl(space.imageUrl);

  const serializedSpace: Space = {
    id: space.id,
    name: space.name,
    description: space.description,
    type: space.type,
    capacity: space.capacity,
    pricePerHour: space.pricePerHour,
    imageUrl: resolvedImageUrl,
    isActive: space.isActive,
    createdAt: space.createdAt.toISOString(),
    updatedAt: space.updatedAt.toISOString(),
  };

  return <SpaceDetailClient space={serializedSpace} />;
}

export default function SpaceDetailPage({ params }: SpaceDetailPageProps) {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 dark:bg-slate-800 rounded-xl w-1/4" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 h-96 bg-gray-200 dark:bg-slate-800 rounded-3xl" />
            <div className="lg:col-span-5 h-96 bg-gray-200 dark:bg-slate-800 rounded-3xl" />
          </div>
        </div>
      }
    >
      <SpaceDetailContent params={params} />
    </Suspense>
  );
}
