'use client';
// src/components/organisms/LeadFormModal.tsx — Création/édition de formulaire de lead (simplifié, français).
import { useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Modal } from '../molecules/Modal';
import { FormField } from '../molecules/FormField';
import { Textarea } from '../atoms/Textarea';
import { Button } from '../atoms/Button';
import type { LeadForm, LeadFormField } from '@/types';

const FIELD_TYPES = ['text', 'email', 'tel', 'phone', 'textarea', 'number'];

const TYPE_LABELS: Record<string, string> = {
  text: 'Texte',
  email: 'Email',
  tel: 'Téléphone',
  phone: 'Téléphone (international)',
  textarea: 'Zone de texte',
  number: 'Nombre',
};

export function LeadFormModal({
  form,
  onClose,
  onSaved,
}: {
  form: LeadForm | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const isNew = form === null;
  const [name, setName] = useState(form?.name ?? '');
  const [fields, setFields] = useState<LeadFormField[]>(
    form?.fields ?? [
      { key: 'firstName', label: 'Prénom', type: 'text', required: true },
      { key: 'lastName', label: 'Nom', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'phone', label: 'Téléphone', type: 'phone', required: true },
    ],
  );
  const [buttonColor, setButtonColor] = useState(form?.buttonColor ?? '#80602d');
  const [buttonLabel, setButtonLabel] = useState(form?.buttonLabel ?? 'Envoyer ma demande');
  const [successMessage, setSuccessMessage] = useState(
    form?.successMessage ?? 'Merci, votre demande a bien été reçue.',
  );
  const [redirectUrl, setRedirectUrl] = useState(form?.redirectUrl ?? '');
  const [isActive, setIsActive] = useState(form?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setField = (i: number, patch: Partial<LeadFormField>) =>
    setFields(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  const save = async () => {
    setBusy(true);
    setErr(null);
    const payload = {
      name: name.trim(),
      fields,
      buttonColor,
      buttonLabel,
      successMessage: successMessage || undefined,
      redirectUrl: redirectUrl || undefined,
    };
    try {
      if (isNew) {
        await api.post('/lead-forms', payload);
        onSaved();
        onClose();
      } else {
        await api.patch(`/lead-forms/${form.id}`, { ...payload, isActive });
        onSaved();
        onClose();
      }
    } catch {
      setErr('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isNew ? 'Nouveau formulaire' : `Modifier: ${form.name}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        {/* Nom du formulaire */}
        <FormField
          id="lf-name"
          label="Nom du formulaire *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Demande de rendez-vous"
        />

        {/* Champs */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Champs du formulaire</p>
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div
                key={i}
                className="rounded-lg border border-gray-200 bg-gray-50/50 p-3"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <input
                    className="col-span-12 rounded-md border border-gray-300 px-3 py-2 text-sm sm:col-span-4"
                    placeholder="Nom du champ"
                    value={f.label}
                    onChange={(e) => setField(i, { label: e.target.value })}
                  />
                  <select
                    className="col-span-12 rounded-md border border-gray-300 px-3 py-2 text-sm sm:col-span-3"
                    value={f.type ?? 'text'}
                    onChange={(e) => setField(i, { type: e.target.value })}
                  >
                    {FIELD_TYPES.map((tp) => (
                      <option key={tp} value={tp}>
                        {TYPE_LABELS[tp] ?? tp}
                      </option>
                    ))}
                  </select>
                  <label className="col-span-12 flex items-center gap-2 text-sm text-gray-700 sm:col-span-3">
                    <input
                      type="checkbox"
                      checked={!!f.required}
                      onChange={(e) => setField(i, { required: e.target.checked })}
                    />
                    Obligatoire
                  </label>
                  <button
                    type="button"
                    className="col-span-12 text-sm text-red-600 hover:text-red-700 sm:col-span-2"
                    onClick={() => setFields(fields.filter((_, idx) => idx !== i))}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            className="mt-2 text-sm"
            onClick={() =>
              setFields([...fields, { key: '', label: '', type: 'text', required: false }])
            }
          >
            + Ajouter un champ
          </Button>
        </div>

        {/* Bouton du formulaire */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            id="lf-btn"
            label="Texte du bouton"
            value={buttonLabel}
            onChange={(e) => setButtonLabel(e.target.value)}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Couleur du bouton
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={buttonColor}
                onChange={(e) => setButtonColor(e.target.value)}
                className="h-10 w-12 rounded border border-gray-300"
              />
              <input
                value={buttonColor}
                onChange={(e) => setButtonColor(e.target.value)}
                className="w-28 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Message de succès */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Message après envoi
          </label>
          <Textarea
            rows={2}
            value={successMessage}
            onChange={(e) => setSuccessMessage(e.target.value)}
          />
        </div>

        {/* URL de redirection */}
        <FormField
          id="lf-redirect"
          label="URL de redirection (optionnel)"
          value={redirectUrl}
          onChange={(e) => setRedirectUrl(e.target.value)}
        />

        {/* Actif */}
        {!isNew && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Formulaire actif
          </label>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button disabled={busy || !name.trim()} onClick={save}>
            {busy ? 'Enregistrement…' : isNew ? 'Créer le formulaire' : 'Enregistrer'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          {err && <span className="text-sm text-red-600">{err}</span>}
        </div>
      </div>
    </Modal>
  );
}
