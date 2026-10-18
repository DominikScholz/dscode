import * as Schema from "effect/Schema";

import { useLocalStorage } from "./hooks/useLocalStorage";

// Debug comparison: the website's typefaces lead the default font stacks, and
// the app rail toggle switches to the platform fonts. index.css keys the
// stacks off the root element's data-font-set attribute.
const FONT_SET_STORAGE_KEY = "t3code:redesign:font-set";
const FontSet = Schema.Literals(["website", "system"]);

export const WEBSITE_SANS_FAMILY = "Aspekta";
export const WEBSITE_CODE_FAMILY = "Azeret Mono";

export function useFontSet() {
  return useLocalStorage(FONT_SET_STORAGE_KEY, "website", FontSet);
}
