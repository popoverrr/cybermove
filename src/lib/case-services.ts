/**
 * BRIEF-SEO §3: «Услуги в проекте» на странице кейса — ссылки на страницы услуг.
 * Источник 1 — дисциплины кейса (cases-detailed.json), по таблице ниже; отраслевые метки (HORECA, RETAIL, VR…) услуг не дают.
 * Источник 2 — услуги, у которых этот кейс указан среди связанных (services.json: `cases`, затем `seo.cases`).
 */
import type { Content } from './i18n';

const BY_DISCIPLINE: Record<string, string> = {
  'PERSONAL BRANDING': 'personal-brand',
  'EXPERT LAUNCH': 'personal-brand',
  'COURSE LAUNCH': 'personal-brand',
  PR: 'pr',
  EVENTS: 'pr',
  'BRAND COMMUNICATIONS': 'pr',
  'B2B COMMUNICATIONS': 'pr',
  'CONTENT PRODUCTION': 'production',
  PRODUCTION: 'production',
  CREATIVE: 'production',
  'AI VISUALS': 'production',
  YOUTUBE: 'production',
  'CONTENT STRATEGY': 'smm',
  SOCIAL: 'smm',
  CONCEPT: 'brand-core',
  ADVERTISING: 'targeting',
  'LOCAL MARKETING': 'targeting',
  'RETAIL MARKETING': 'targeting',
  STRATEGY: 'strategy',
  'BUSINESS DEVELOPMENT': 'strategy',
  EXPANSION: 'strategy',
  PRODUCT: 'strategy',
  CONSULTING: 'business-audit',
  OPERATIONS: 'business-audit',
  'E-COMMERCE': 'websites',
  CHATBOTS: 'ai',
  TENDERS: 'tender-application',
  CONTRACTS: 'contracts',
};

export interface CaseService {
  id: string;
  name: string;
  href: string;
  direction: string;
}

export function caseServices(c: Content, caseId: string, disciplines: string[], limit = 4): CaseService[] {
  const ids: string[] = [];
  const add = (id: string | undefined) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  for (const d of disciplines) add(BY_DISCIPLINE[d.trim().toUpperCase()]);
  for (const dir of c.services.directions) for (const s of dir.services) if (s.cases.includes(caseId)) add(s.id);
  for (const dir of c.services.directions) for (const s of dir.services) if (s.seo.cases.includes(caseId)) add(s.id);
  const out: CaseService[] = [];
  for (const id of ids.slice(0, limit)) {
    for (const dir of c.services.directions) {
      const s = dir.services.find((x) => x.id === id);
      if (s) out.push({ id, name: s.name, href: `/services/${dir.slug}/${s.id}/`, direction: dir.name });
    }
  }
  return out;
}
