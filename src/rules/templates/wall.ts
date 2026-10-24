// src/rules/templates/wall.ts — قوالب العائلة العلوية (بيانات فقط).
import { defineTemplates, doors } from './helpers';

export const WALL_TEMPLATES = defineTemplates('WALL', {
  Standard_Wall: { label: 'خزانة علوية عادية', zones: [doors(2, 1)] },
});
