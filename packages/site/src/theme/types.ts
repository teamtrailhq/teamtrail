/** The shared cookie's two values: day or night as teamtrail.app and Cloud both say it. */
export type SharedTheme = 'light' | 'dark';

/**
 * What a page calls its two looks on `<html data-theme>`: teamtrail.app says `day` and `night`, Cloud `light` and
 * `dark`.
 */
export type ThemeNames = { day: string; night: string };
