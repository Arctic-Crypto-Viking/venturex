import type { Metadata, Viewport } from "next";
import "@core/fonts"; // the six fonts of the five looks
import "./globals.css";
import { brand } from "@/brand";
import { getTemplate, getTheme, themeColor } from "@core/lib/theme";
import { getLocale } from "@core/lib/i18n";

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  appleWebApp: { capable: true, statusBarStyle: "default", title: brand.name },
  openGraph: { siteName: brand.name },
  formatDetection: { telephone: false },
};

export async function generateViewport(): Promise<Viewport> {
  const [theme, template] = await Promise.all([getTheme(), getTemplate()]);
  return { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: themeColor(template, theme) };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [theme, template, locale] = await Promise.all([getTheme(), getTemplate(), getLocale()]);
  return (
    <html lang={locale} data-theme={theme} data-template={template}>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">{children}</body>
    </html>
  );
}
