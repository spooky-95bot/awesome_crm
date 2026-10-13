'use client';
// app/(dashboard)/cms/page.tsx — CMS du site Elysence : admin en plein écran, adapté mobile.
import { DashboardTemplate } from '@/components/templates/DashboardTemplate';

export default function CmsPage() {
  return (
    <DashboardTemplate title="CMS — Site Elysence">
      <div className="h-[calc(100dvh-180px)] min-h-[500px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <iframe
          src="https://elysence-premiere.pages.dev/cms.html"
          title="Administration du site Elysence"
          className="h-full w-full border-0"
        />
      </div>
    </DashboardTemplate>
  );
}
