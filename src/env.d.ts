/** Astro.locals の型。中身は src/middleware.ts が入れる */
declare namespace App {
  interface Locals {
    i18n: import("./i18n/locals.ts").I18nLocals;
  }
}
