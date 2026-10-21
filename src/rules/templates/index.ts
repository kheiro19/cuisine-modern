// src/rules/templates/index.ts — يجمع قوالب العائلات الثلاث (أربعة قوالب). لإضافة قالب: افتح ملف عائلته وأضف سطرًا.
import { BASE_TEMPLATES } from './base';
import { CORNER_TEMPLATES } from './corner';
import { WALL_TEMPLATES } from './wall';
import type { FamilyId } from '../families';

export const TEMPLATES = { ...WALL_TEMPLATES, ...BASE_TEMPLATES, ...CORNER_TEMPLATES };
export type CabinetSubtype = keyof typeof TEMPLATES;
export const SUBTYPES = Object.keys(TEMPLATES) as CabinetSubtype[];

/** قوالب عائلة معيّنة بترتيب تعريفها (الأول هو الافتراضي عند تبديل العائلة). */
export const templatesOf = (family: FamilyId): CabinetSubtype[] => SUBTYPES.filter((s) => TEMPLATES[s].family === family);
export type { TemplateDef, TemplateInput } from './helpers';
