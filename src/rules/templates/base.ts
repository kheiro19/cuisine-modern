// src/rules/templates/base.ts — قوالب العائلة السفلية (بيانات فقط).
import { defineTemplates, doors } from './helpers';

export const BASE_TEMPLATES = defineTemplates('BASE', {
  Standard_Base: { label: 'خزانة سفلية عادية', zones: [doors(2, 1)] },
});
