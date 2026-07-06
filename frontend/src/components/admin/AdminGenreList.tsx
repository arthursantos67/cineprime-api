"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { adminApi, type AdminGenre } from "@/api/admin";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { AdminConfirmDialog, AdminTable, AdminToolbar } from "@/components/admin";
import type { AdminTableColumn } from "@/components/admin";
import { useI18n } from "@/i18n";
import { SUPPORTED_LOCALES, type Locale } from "@/i18n/locales";

function getLocalizedName(genre: AdminGenre, locale: Locale): string {
  const fromTranslations = genre.translations?.[locale]?.name;
  if (fromTranslations) return fromTranslations;
  if (locale !== "pt-BR") {
    const ptBr = genre.translations?.["pt-BR"]?.name;
    if (ptBr) return ptBr;
  }
  return genre.name;
}

export function AdminGenreList() {
  const { locale, t } = useI18n();
  const [genres, setGenres] = useState<AdminGenre[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocale, setEditLocale] = useState<Locale>(locale);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [pendingEdit, setPendingEdit] = useState<{ id: string; name: string; locale: Locale } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<AdminGenre | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [showCreateInput, setShowCreateInput] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createLocale, setCreateLocale] = useState<Locale>(locale);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const editInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const fetchPage = useCallback(async (pageNum: number, replace: boolean) => {
    if (replace) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setErrorMessage(null);

    try {
      const result = await adminApi.listGenres({ page: pageNum });
      setGenres((prev) => (replace ? result.results : [...prev, ...result.results]));
      setHasMore(result.next !== null);
      setPage(pageNum);
    } catch {
      setErrorMessage(t("admin.genre.loadError"));
    } finally {
      if (replace) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, [t]);

  useEffect(() => {
    fetchPage(1, true);
  }, [fetchPage]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 120 && hasMore && !loadingMore && !loading) {
      fetchPage(page + 1, false);
    }
  }

  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus();
    }
  }, [editingId]);

  useEffect(() => {
    if (showCreateInput) {
      createInputRef.current?.focus();
    }
  }, [showCreateInput]);

  function startEdit(genre: AdminGenre) {
    setEditingId(genre.id);
    const hasLocaleTranslation = locale === "pt-BR" || !!genre.translations?.[locale]?.name;
    const effectiveLocale = hasLocaleTranslation ? locale : "pt-BR";
    setEditName(getLocalizedName(genre, locale));
    setEditLocale(effectiveLocale);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditLocale(locale);
    setEditError(null);
  }

  async function commitSaveEdit(genreId: string, name: string, srcLocale: Locale) {
    setIsSaving(true);
    setEditError(null);
    try {
      const updated = await adminApi.updateGenre(genreId, {
        name,
        source_language: srcLocale,
      });
      setGenres((prev) => prev.map((g) => (g.id === genreId ? { ...g, ...updated } : g)));
      cancelEdit();
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_FAILED") {
        const details = err.details as Record<string, unknown> | null;
        const nameErr = details?.name;
        const msg = Array.isArray(nameErr) ? nameErr[0] : String(nameErr ?? "");
        setEditError(
          msg.toLowerCase().includes("already exists")
            ? t("admin.genre.alreadyExists")
            : msg || t("admin.genre.emptyName")
        );
      } else {
        setEditError(t("admin.error.saveGenre"));
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleSaveEdit(genreId: string) {
    const name = editName.trim();
    if (!name) return;
    setPendingEdit({ id: genreId, name, locale: editLocale });
  }

  async function confirmRetranslate() {
    if (!pendingEdit) return;
    setPendingEdit(null);
    await commitSaveEdit(pendingEdit.id, pendingEdit.name, pendingEdit.locale);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await adminApi.deleteGenre(deleteTarget.id);
      setDeleteTarget(null);
      setGenres([]);
      fetchPage(1, true);
    } catch {
      setErrorMessage(t("admin.genre.deleteError"));
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleCreate() {
    const name = createName.trim();
    if (!name) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      await adminApi.createGenre({ name, source_language: createLocale });
      setCreateName("");
      setCreateLocale(locale);
      setShowCreateInput(false);
      setGenres([]);
      fetchPage(1, true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_FAILED") {
        const details = err.details as Record<string, unknown> | null;
        const nameErr = details?.name;
        const msg = Array.isArray(nameErr) ? nameErr[0] : String(nameErr ?? "");
        setCreateError(
          msg.toLowerCase().includes("already exists")
            ? t("admin.genre.alreadyExists")
            : msg || t("admin.genre.emptyName")
        );
      } else {
        setCreateError(t("admin.genre.createError"));
      }
    } finally {
      setIsCreating(false);
    }
  }

  const localeSelectClass = [
    "min-h-[var(--control-height)] rounded-control border border-border bg-surface px-2 py-1.5",
    "text-sm text-white outline-none transition focus:border-brand focus:shadow-focus",
  ].join(" ");

  const columns: AdminTableColumn<Record<string, unknown>>[] = [
    {
      key: "name",
      label: t("admin.genre.name"),
      render: (row) => {
        const genre = row as unknown as AdminGenre;
        if (editingId === genre.id) {
          return (
            <div className="flex flex-col gap-1">
              <div className="flex gap-2">
                <input
                  className={[
                    "flex-1 min-h-[var(--control-height)] rounded-control border bg-surface px-3 py-1.5",
                    "text-sm text-white outline-none transition focus:border-brand focus:shadow-focus",
                    editError ? "border-error" : "border-border",
                  ].join(" ")}
                  disabled={isSaving}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit(genre.id);
                    if (e.key === "Escape") cancelEdit();
                  }}
                  ref={editInputRef}
                  value={editName}
                />
                <select
                  className={localeSelectClass}
                  disabled={isSaving}
                  onChange={(e) => setEditLocale(e.target.value as Locale)}
                  value={editLocale}
                  aria-label={t("admin.genre.sourceLanguage")}
                >
                  {SUPPORTED_LOCALES.map((loc) => (
                    <option key={loc} value={loc}>
                      {t(`language.${loc}`)}
                    </option>
                  ))}
                </select>
              </div>
              {editError ? (
                <p className="text-xs font-bold text-error" role="alert">
                  {editError}
                </p>
              ) : null}
            </div>
          );
        }
        const displayName = getLocalizedName(genre, locale);
        const hasTranslation =
          locale === "pt-BR"
            ? true
            : !!genre.translations?.[locale]?.name;
        const isFallback = !hasTranslation;
        return (
          <span className="font-medium text-white">
            {displayName}
            {isFallback ? (
              <span className="ml-2 text-xs font-normal text-white/40" title={t("admin.genre.fallbackHint")}>
                pt-BR
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "actions",
      label: t("admin.actions"),
      className: "w-px whitespace-nowrap text-right",
      render: (row) => {
        const genre = row as unknown as AdminGenre;
        if (editingId === genre.id) {
          return (
            <div className="flex items-center justify-end gap-2">
              <Button
                disabled={isSaving || !editName.trim()}
                isLoading={isSaving}
                onClick={() => handleSaveEdit(genre.id)}
                size="sm"
                type="button"
                variant="primary"
              >
                {t("admin.save")}
              </Button>
              <Button
                disabled={isSaving}
                onClick={cancelEdit}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("admin.cancel")}
              </Button>
            </div>
          );
        }
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={() => startEdit(genre)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("admin.edit")}
            </Button>
            <Button
              onClick={() => setDeleteTarget(genre)}
              size="sm"
              type="button"
              variant="danger"
            >
              {t("admin.delete")}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="grid gap-6">
      <AdminToolbar
        actions={
          <Button
            onClick={() => {
              setShowCreateInput(true);
              setCreateName("");
              setCreateLocale(locale);
              setCreateError(null);
            }}
            size="sm"
            type="button"
            variant="primary"
          >
            {t("admin.genre.new")}
          </Button>
        }
        title={t("admin.genres")}
      />

      {errorMessage ? (
        <p className="text-sm font-bold text-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {showCreateInput ? (
        <div className="flex flex-col gap-2 rounded-[8px] border border-brand/30 bg-brand/5 p-4">
          <span className="text-sm font-extrabold text-white">{t("admin.genre.new")}</span>
          <div className="flex gap-2">
            <input
              className={[
                "flex-1 min-h-[var(--control-height-lg)] rounded-control border bg-surface px-3 py-2",
                "text-sm text-white placeholder:text-white/30 outline-none transition",
                "focus:border-brand focus:shadow-focus",
                createError ? "border-error" : "border-border",
              ].join(" ")}
              disabled={isCreating}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") {
                  setShowCreateInput(false);
                  setCreateName("");
                  setCreateLocale(locale);
                  setCreateError(null);
                }
              }}
              placeholder={t("admin.genre.namePlaceholder")}
              ref={createInputRef}
              value={createName}
            />
            <select
              className={localeSelectClass}
              disabled={isCreating}
              onChange={(e) => setCreateLocale(e.target.value as Locale)}
              value={createLocale}
              aria-label={t("admin.genre.sourceLanguage")}
            >
              {SUPPORTED_LOCALES.map((loc) => (
                <option key={loc} value={loc}>
                  {t(`language.${loc}`)}
                </option>
              ))}
            </select>
            <Button
              disabled={isCreating || !createName.trim()}
              isLoading={isCreating}
              onClick={handleCreate}
              size="sm"
              type="button"
              variant="primary"
            >
              {t("admin.create")}
            </Button>
            <Button
              disabled={isCreating}
              onClick={() => {
                setShowCreateInput(false);
                setCreateName("");
                setCreateLocale(locale);
                setCreateError(null);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("admin.cancel")}
            </Button>
          </div>
          {createError ? (
            <p className="text-sm font-bold text-error" role="alert">
              {createError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className="max-h-[600px] overflow-y-auto rounded-[8px]"
        onScroll={handleScroll}
        ref={scrollContainerRef}
      >
        <AdminTable
          caption={t("admin.genre.listCaption")}
          columns={columns}
          data={genres as unknown as Record<string, unknown>[]}
          emptyDescription={t("admin.genre.emptyDescription")}
          emptyTitle={t("admin.genre.emptyTitle")}
          keyField="id"
          loading={loading}
        />

        {loadingMore ? (
          <p className="border-t border-white/[0.05] py-3 text-center text-xs text-white/40">
            {t("admin.genre.loadingMore")}
          </p>
        ) : null}
      </div>

      <AdminConfirmDialog
        confirmLabel={isDeleting ? t("admin.deleting") : t("admin.delete")}
        description={t("admin.genre.deleteDescription", { name: deleteTarget?.name ?? "" })}
        isOpen={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t("admin.genre.deleteTitle")}
        tone="danger"
      />

      <AdminConfirmDialog
        confirmLabel={t("admin.genre.retranslateConfirm")}
        description={t("admin.genre.retranslateDescription")}
        isOpen={pendingEdit !== null}
        onCancel={() => setPendingEdit(null)}
        onConfirm={confirmRetranslate}
        title={t("admin.genre.retranslateTitle")}
        tone="default"
      />
    </div>
  );
}
