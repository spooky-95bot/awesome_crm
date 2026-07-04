'use client';
// app/(dashboard)/connections/page.tsx — v3 entegrasyon bağlantıları (panelden bağlan).
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { DashboardTemplate } from '@/components/templates/DashboardTemplate';
import { Card } from '@/components/atoms/Card';
import { Button } from '@/components/atoms/Button';
import { Badge } from '@/components/atoms/Badge';
import { Spinner } from '@/components/atoms/Spinner';
import { Modal } from '@/components/molecules/Modal';
import { FormField } from '@/components/molecules/FormField';

interface ProviderField {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
}
interface ProviderDef {
  key: string;
  name: string;
  category: string;
  authType: string;
  available: boolean;
  testable: boolean;
  fields: ProviderField[];
}
interface Connection {
  id: string;
  provider: string;
  providerName: string;
  category: string;
  label: string | null;
  status: string;
  secretFields: string[];
}

export default function ConnectionsPage() {
  const { can } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const manage = can('integration.manage');
  const [connecting, setConnecting] = useState<ProviderDef | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const catalog = useQuery({
    queryKey: ['conn-catalog'],
    queryFn: async () =>
      unwrap<{ cryptoReady: boolean; providers: ProviderDef[] }>(
        (await api.get('/connections/catalog')).data,
      ),
  });
  const conns = useQuery({
    queryKey: ['connections'],
    queryFn: async () =>
      unwrap<Connection[]>((await api.get('/connections')).data),
  });
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['connections'] });

  const catLabel = (c: string) =>
    ({
      messaging: t('conn.catMessaging'),
      payments: t('conn.catPayments'),
      accounting: t('conn.catAccounting'),
      research: t('conn.catResearch'),
    })[c] ?? t('conn.catOther');

  const connect = useMutation({
    mutationFn: async () => {
      const p = connecting!;
      const secrets: Record<string, string> = {};
      const config: Record<string, string> = {};
      for (const f of p.fields) {
        const v = form[f.key] ?? '';
        if (f.secret) secrets[f.key] = v;
        else config[f.key] = v;
      }
      await api.post('/connections', { provider: p.key, secrets, config });
    },
    onSuccess: () => {
      setConnecting(null);
      setForm({});
      invalidate();
    },
  });
  const test = useMutation({
    mutationFn: async (id: string) =>
      unwrap<{ ok: boolean; message: string }>(
        (await api.post(`/connections/${id}/test`)).data,
      ),
    onSuccess: (r) => alert(r.message),
  });
  const authorize = useMutation({
    mutationFn: async (id: string) =>
      unwrap<{ url: string }>(
        (await api.get(`/connections/${id}/oauth/start`)).data,
      ),
    onSuccess: (r) => {
      window.location.href = r.url; // sağlayıcı yetkilendirme sayfasına git
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/connections/${id}`),
    onSuccess: invalidate,
  });

  const byProvider = new Map(
    (conns.data ?? []).map((c) => [c.provider, c]),
  );

  return (
    <DashboardTemplate title="page.connections">
      <p className="mb-3 text-sm text-gray-500">{t('conn.hint')}</p>
      {catalog.data && !catalog.data.cryptoReady && (
        <Card className="mb-4 border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {t('conn.cryptoMissing')}
        </Card>
      )}

      {catalog.isLoading || conns.isLoading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(catalog.data?.providers ?? []).map((p) => {
            const conn = byProvider.get(p.key);
            return (
              <Card key={p.key} className="flex flex-col p-4">
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800">{p.name}</h3>
                  {conn ? (
                    <Badge
                      tone={
                        conn.status === 'connected'
                          ? 'green'
                          : conn.status === 'pending_auth'
                            ? 'amber'
                            : 'gray'
                      }
                    >
                      {conn.status === 'connected'
                        ? t('conn.connected')
                        : conn.status === 'pending_auth'
                          ? t('conn.pendingAuth')
                          : t('conn.disabled')}
                    </Badge>
                  ) : (
                    !p.available && (
                      <Badge tone="gray">{t('conn.comingSoon')}</Badge>
                    )
                  )}
                </div>
                <p className="mb-3 text-xs text-gray-400">{catLabel(p.category)}</p>

                <div className="mt-auto flex flex-wrap gap-2">
                  {conn ? (
                    manage && (
                      <>
                        {conn.status === 'pending_auth' && (
                          <Button
                            className="px-3 py-1 text-xs"
                            onClick={() => authorize.mutate(conn.id)}
                            disabled={authorize.isPending}
                          >
                            {t('conn.authorize')}
                          </Button>
                        )}
                        {p.testable && (
                          <Button
                            variant="secondary"
                            className="px-2 py-1 text-xs"
                            onClick={() => test.mutate(conn.id)}
                            disabled={test.isPending}
                          >
                            {t('conn.test')}
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          className="px-2 py-1 text-xs"
                          onClick={() => {
                            if (confirm(t('conn.deleteConfirm')))
                              remove.mutate(conn.id);
                          }}
                        >
                          {t('common.delete')}
                        </Button>
                      </>
                    )
                  ) : (
                    manage && (
                      <Button
                        className="px-3 py-1 text-xs"
                        disabled={!p.available}
                        onClick={() => {
                          setForm({});
                          setConnecting(p);
                        }}
                      >
                        {t('conn.connect')}
                      </Button>
                    )
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {connecting && (
        <Modal
          title={`${t('conn.connect')} — ${connecting.name}`}
          onClose={() => setConnecting(null)}
        >
          <div className="space-y-3">
            {connecting.fields.map((f) => (
              <FormField
                key={f.key}
                id={`cf-${f.key}`}
                label={`${f.label}${f.required ? ' *' : ''}`}
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                value={form[f.key] ?? ''}
                onChange={(e) =>
                  setForm((s) => ({ ...s, [f.key]: e.target.value }))
                }
              />
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
              {connect.isPending ? '…' : t('conn.connect')}
            </Button>
            <Button variant="ghost" onClick={() => setConnecting(null)}>
              {t('common.cancel')}
            </Button>
            {connect.isError && (
              <span className="text-sm text-red-600">{t('common.error')}</span>
            )}
          </div>
        </Modal>
      )}
    </DashboardTemplate>
  );
}
