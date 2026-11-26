"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { PricingModel, Space } from "@/types/space";

const DEFAULT_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80";

export default function AdminSpacesPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    type: string;
    capacity: string;
    pricingModel: PricingModel;
    pricePerHour: string;
    pricePerPerson: string;
    imageUrl: string;
  }>({
    name: "",
    description: "",
    type: "Escritorio",
    capacity: "1",
    pricingModel: "PER_SPACE",
    pricePerHour: "15000",
    pricePerPerson: "",
    imageUrl: DEFAULT_FALLBACK_IMAGE,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchSpaces = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/spaces?includeInactive=true");
      if (res.ok) {
        const data = await res.json();
        setSpaces(data.spaces || []);
      }
    } catch {
      setFeedback({ type: "error", text: "Error al cargar la lista de espacios." });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpaces();
  }, [fetchSpaces]);

  const revokeBlobPreview = (url: string | null) => {
    if (url && url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    revokeBlobPreview(previewUrl);
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(editingSpace ? editingSpace.imageUrl : null);
    }
  };

  const resetModalState = () => {
    revokeBlobPreview(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setEditingSpace(null);
    setFormData({
      name: "",
      description: "",
      type: "Escritorio",
      capacity: "1",
      pricingModel: "PER_SPACE",
      pricePerHour: "15000",
      pricePerPerson: "",
      imageUrl: DEFAULT_FALLBACK_IMAGE,
    });
  };

  const openCreateModal = () => {
    resetModalState();
    setIsModalOpen(true);
  };

  const openEditModal = (space: Space) => {
    revokeBlobPreview(previewUrl);
    setSelectedFile(null);
    setEditingSpace(space);
    setPreviewUrl(space.imageUrl);
    setFormData({
      name: space.name,
      description: space.description,
      type: space.type,
      capacity: String(space.capacity),
      pricingModel: space.pricingModel ?? "PER_SPACE",
      pricePerHour: space.pricePerHour > 0 ? String(space.pricePerHour) : "",
      pricePerPerson:
        space.pricePerPerson !== null && space.pricePerPerson !== undefined
          ? String(space.pricePerPerson)
          : "",
      imageUrl: space.imageUrl,
    });
    setIsModalOpen(true);
  };

  const handleToggleActive = async (space: Space) => {
    setTogglingId(space.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/spaces/${space.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !space.isActive }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({
          type: "success",
          text: `Espacio "${space.name}" ${!space.isActive ? "activado" : "desactivado"} exitosamente.`,
        });
        setSpaces((prev) =>
          prev.map((s) => (s.id === space.id ? { ...s, isActive: !space.isActive } : s))
        );
      } else {
        setFeedback({ type: "error", text: data.error || "No se pudo actualizar el estado." });
      }
    } catch {
      setFeedback({ type: "error", text: "Error de red al alternar el estado del espacio." });
    } finally {
      setTogglingId(null);
    }
  };

  const handleSaveSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      let uploadedImageKey: string | undefined;

      // 1. Si el administrador seleccionó una imagen local, subirla primero a AWS S3
      if (selectedFile) {
        const uploadBody = new FormData();
        uploadBody.append("file", selectedFile);
        uploadBody.append("folder", "originals");

        const uploadRes = await fetch("/api/uploads", {
          method: "POST",
          body: uploadBody,
        });

        if (!uploadRes.ok) {
          if (uploadRes.status === 413) {
            setFeedback({
              type: "error",
              text: "La imagen supera el tamaño máximo permitido (5 MB). Selecciona una más ligera.",
            });
          } else {
            const uploadData = await uploadRes.json().catch(() => ({}));
            setFeedback({
              type: "error",
              text: uploadData.error || `Error al subir la imagen a AWS S3 (HTTP ${uploadRes.status}).`,
            });
          }
          setIsSubmitting(false);
          return;
        }

        const uploadData = await uploadRes.json();
        uploadedImageKey = uploadData.key;
      }

      const parsedCapacity = Number(formData.capacity);
      const parsedPricePerHour =
        formData.pricePerHour.trim() === "" ? 0 : Number(formData.pricePerHour);
      const parsedPricePerPerson =
        formData.pricePerPerson.trim() === "" ? null : Number(formData.pricePerPerson);

      if (editingSpace) {
        const payload: Record<string, unknown> = {
          name: formData.name,
          description: formData.description,
          type: formData.type,
          capacity: parsedCapacity,
          pricingModel: formData.pricingModel,
          pricePerHour: parsedPricePerHour,
          pricePerPerson: formData.pricingModel === "PER_SPACE" ? null : parsedPricePerPerson,
        };
        if (uploadedImageKey) {
          payload.imageUrl = uploadedImageKey;
        }

        const res = await fetch(`/api/spaces/${editingSpace.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok) {
          setFeedback({ type: "error", text: data.error || "Error al actualizar el espacio." });
          return;
        }

        setSpaces((prev) =>
          prev.map((s) => (s.id === editingSpace.id ? data.space : s))
        );
        setFeedback({
          type: "success",
          text: uploadedImageKey
            ? "¡Espacio actualizado y nueva fotografía almacenada en AWS S3!"
            : `¡Espacio "${data.space.name}" actualizado exitosamente!`,
        });
        setIsModalOpen(false);
        resetModalState();
      } else {
        const res = await fetch("/api/spaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            description: formData.description,
            type: formData.type,
            capacity: parsedCapacity,
            pricingModel: formData.pricingModel,
            pricePerHour: parsedPricePerHour,
            pricePerPerson: formData.pricingModel === "PER_SPACE" ? null : parsedPricePerPerson,
            imageUrl: uploadedImageKey ?? formData.imageUrl,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setFeedback({ type: "error", text: data.error || "Error al crear el espacio." });
          return;
        }

        setFeedback({
          type: "success",
          text: uploadedImageKey
            ? "¡Espacio creado y fotografía almacenada en AWS S3!"
            : "¡Nuevo espacio creado satisfactoriamente!",
        });
        setIsModalOpen(false);
        resetModalState();
        fetchSpaces();
      }
    } catch {
      setFeedback({ type: "error", text: "Error de conexión al guardar el espacio." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8 flex-1">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EC4899]/15 text-[#EC4899] dark:text-[#F472B6] text-xs font-bold uppercase tracking-wider mb-2">
            Gestión de Inventario
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-[#111827] dark:text-white tracking-tight">
            Catálogo de Espacios
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-1">
            Crea, edita y habilita o deshabilita los espacios ofertados en la plataforma.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openCreateModal}
            className="px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl text-white bg-[#6D28D9] hover:bg-[#5B21B6] transition-all shadow-md shadow-purple-600/20 cursor-pointer"
          >
            + Añadir Nuevo Espacio
          </button>
          <Link
            href="/admin"
            className="px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl text-gray-700 dark:text-slate-200 bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all"
          >
            &larr; Volver a Admin
          </Link>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 text-xs sm:text-sm rounded-2xl border flex items-center justify-between ${
            feedback.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800"
              : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900"
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-xs font-bold underline ml-4 cursor-pointer">
            Cerrar
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-80 bg-white dark:bg-[#1E293B] rounded-3xl border border-gray-100 dark:border-slate-800 animate-pulse"
            />
          ))}
        </div>
      ) : spaces.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#1E293B] rounded-3xl border border-dashed border-gray-200 dark:border-slate-800">
          <p className="text-sm font-bold text-gray-600 dark:text-slate-400">
            No hay espacios dados de alta en la base de datos.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-3 px-4 py-2 text-xs font-bold text-white bg-[#6D28D9] rounded-xl hover:bg-[#5B21B6]"
          >
            Crear el primer espacio
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {spaces.map((s) => (
            <div
              key={s.id}
              className={`bg-white dark:bg-[#1E293B] rounded-3xl border ${
                s.isActive ? "border-gray-100 dark:border-slate-800" : "border-red-200 dark:border-red-900/60 opacity-80"
              } overflow-hidden shadow-xs hover:shadow-lg transition-all flex flex-col justify-between`}
            >
              <div>
                <div className="relative h-44 w-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                  <Image
                    src={s.imageUrl}
                    alt={s.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="bg-black/75 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                      {s.type}
                    </span>
                  </div>
                  <div className="absolute top-3 right-3">
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
                        s.isActive ? "bg-emerald-500 text-white" : "bg-red-600 text-white"
                      }`}
                    >
                      {s.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </div>

                <div className="p-5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-[#111827] dark:text-white line-clamp-1">{s.name}</h3>
                    <span className="text-[11px] font-bold text-[#6D28D9] dark:text-[#A78BFA] shrink-0">
                      Cap: {s.capacity}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2">{s.description}</p>
                </div>
              </div>

              <div className="p-5 pt-4 border-t border-gray-100 dark:border-slate-800 mt-4 flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-slate-400 block">Tarifa</span>
                  {(s.pricingModel === "PER_SPACE" || s.pricingModel === "BOTH" || !s.pricingModel) && (
                    <span className="text-sm font-black text-[#111827] dark:text-white block">
                      {new Intl.NumberFormat("es-CO", {
                        style: "currency",
                        currency: "COP",
                        maximumFractionDigits: 0,
                      }).format(s.pricePerHour)}
                      <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400"> /h espacio</span>
                    </span>
                  )}
                  {(s.pricingModel === "PER_PERSON" || s.pricingModel === "BOTH") &&
                    s.pricePerPerson !== null &&
                    s.pricePerPerson !== undefined && (
                      <span className="text-xs font-bold text-[#6D28D9] dark:text-[#A78BFA] block">
                        {new Intl.NumberFormat("es-CO", {
                          style: "currency",
                          currency: "COP",
                          maximumFractionDigits: 0,
                        }).format(s.pricePerPerson)}
                        <span className="font-semibold text-gray-500 dark:text-slate-400"> /h persona</span>
                      </span>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openEditModal(s)}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl text-[#6D28D9] dark:text-[#A78BFA] border border-[#6D28D9]/30 dark:border-[#8B5CF6]/40 hover:bg-[#6D28D9]/10 transition-all cursor-pointer"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleToggleActive(s)}
                    disabled={togglingId === s.id}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      s.isActive
                        ? "text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/40"
                        : "text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                    }`}
                  >
                    {togglingId === s.id ? "Guardando..." : s.isActive ? "Deshabilitar" : "Habilitar"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1E293B] rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-gray-100 dark:border-slate-800 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-[#111827] dark:text-white">
                {editingSpace ? "Editar Espacio" : "Crear Nuevo Espacio"}
              </h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  resetModalState();
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSpace} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1 text-[11px]">
                  Nombre del Espacio
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Oficina Ejecutiva 302"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1 text-[11px]">
                  Descripción Detallada
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe las características y ambiente del espacio..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1 text-[11px]">
                    Tipo
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#6D28D9] cursor-pointer"
                  >
                    <option value="Escritorio">Escritorio</option>
                    <option value="Sala de reuniones">Sala de reuniones</option>
                    <option value="Cabina">Cabina</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1 text-[11px]">
                    Capacidad (Personas)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="Ej. 4"
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1 text-[11px]">
                  Modalidad de Tarifa
                </label>
                <select
                  value={formData.pricingModel}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      pricingModel: e.target.value as PricingModel,
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#6D28D9] cursor-pointer"
                >
                  <option value="PER_SPACE">Alquiler del espacio completo</option>
                  <option value="PER_PERSON">Pase por persona</option>
                  <option value="BOTH">Ambos (espacio completo o por persona)</option>
                </select>
              </div>

              <div
                className={`grid gap-3 ${
                  formData.pricingModel === "BOTH" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
                }`}
              >
                {(formData.pricingModel === "PER_SPACE" || formData.pricingModel === "BOTH") && (
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1 text-[11px]">
                      Precio Espacio / Hora (COP)
                    </label>
                    <input
                      type="number"
                      min="1000"
                      step="1000"
                      required
                      placeholder="Ej. 60000"
                      value={formData.pricePerHour}
                      onChange={(e) => setFormData({ ...formData, pricePerHour: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]"
                    />
                  </div>
                )}

                {(formData.pricingModel === "PER_PERSON" || formData.pricingModel === "BOTH") && (
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1 text-[11px]">
                      Precio por Persona / Hora (COP)
                    </label>
                    <input
                      type="number"
                      min="1000"
                      step="1000"
                      required
                      placeholder="Ej. 15000"
                      value={formData.pricePerPerson}
                      onChange={(e) => setFormData({ ...formData, pricePerPerson: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1 text-[11px]">
                  Fotografía del Espacio (AWS S3 · JPG, PNG, WEBP · Máx 5MB)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="w-full text-xs text-gray-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#6D28D9]/15 file:text-[#6D28D9] dark:file:text-[#A78BFA] hover:file:bg-[#6D28D9]/25 cursor-pointer"
                />
                {previewUrl && (
                  <div className="mt-3 relative h-36 w-full rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Vista previa"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetModalState();
                  }}
                  className="px-4 py-2.5 font-bold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 font-bold text-white bg-[#6D28D9] hover:bg-[#5B21B6] rounded-xl shadow-md shadow-purple-600/30 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting
                    ? selectedFile
                      ? "Subiendo a S3..."
                      : "Guardando..."
                    : editingSpace
                      ? "Guardar Cambios"
                      : "Crear Espacio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
