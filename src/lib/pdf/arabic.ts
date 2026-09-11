/**
 * Arabic presentation-form reshaper + compact bidi visualiser.
 *
 * pdf-lib draws glyphs left-to-right and does not apply OpenType GSUB/bidi
 * shaping for Arabic. We therefore:
 *   1) choose the correct Arabic presentation form for every letter,
 *   2) keep Latin/numbers in LTR runs,
 *   3) reverse only RTL runs,
 *   4) reverse the order of runs when the paragraph is RTL.
 *
 * This keeps Arabic words connected while preserving values such as:
 * "15%", "62.20 SAR", dates, references, etc.
 */

type Forms = [isolated: number, final: number, initial: number, medial: number];

const LETTERS: Record<number, Forms> = {
  0x0621: [0xfe80, 0xfe80, 0xfe80, 0xfe80],
  0x0622: [0xfe81, 0xfe82, 0xfe81, 0xfe82],
  0x0623: [0xfe83, 0xfe84, 0xfe83, 0xfe84],
  0x0624: [0xfe85, 0xfe86, 0xfe85, 0xfe86],
  0x0625: [0xfe87, 0xfe88, 0xfe87, 0xfe88],
  0x0626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c],
  0x0627: [0xfe8d, 0xfe8e, 0xfe8d, 0xfe8e],
  0x0628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92],
  0x0629: [0xfe93, 0xfe94, 0xfe93, 0xfe94],
  0x062a: [0xfe95, 0xfe96, 0xfe97, 0xfe98],
  0x062b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c],
  0x062c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0],
  0x062d: [0xfea1, 0xfea2, 0xfea3, 0xfea4],
  0x062e: [0xfea5, 0xfea6, 0xfea7, 0xfea8],
  0x062f: [0xfea9, 0xfeaa, 0xfea9, 0xfeaa],
  0x0630: [0xfeab, 0xfeac, 0xfeab, 0xfeac],
  0x0631: [0xfead, 0xfeae, 0xfead, 0xfeae],
  0x0632: [0xfeaf, 0xfeb0, 0xfeaf, 0xfeb0],
  0x0633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4],
  0x0634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8],
  0x0635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc],
  0x0636: [0xfebd, 0xfebe, 0xfebf, 0xfec0],
  0x0637: [0xfec1, 0xfec2, 0xfec3, 0xfec4],
  0x0638: [0xfec5, 0xfec6, 0xfec7, 0xfec8],
  0x0639: [0xfec9, 0xfeca, 0xfecb, 0xfecc],
  0x063a: [0xfecd, 0xfece, 0xfecf, 0xfed0],
  0x0641: [0xfed1, 0xfed2, 0xfed3, 0xfed4],
  0x0642: [0xfed5, 0xfed6, 0xfed7, 0xfed8],
  0x0643: [0xfed9, 0xfeda, 0xfedb, 0xfedc],
  0x0644: [0xfedd, 0xfede, 0xfedf, 0xfee0],
  0x0645: [0xfee1, 0xfee2, 0xfee3, 0xfee4],
  0x0646: [0xfee5, 0xfee6, 0xfee7, 0xfee8],
  0x0647: [0xfee9, 0xfeea, 0xfeeb, 0xfeec],
  0x0648: [0xfeed, 0xfeee, 0xfeed, 0xfeee],
  0x0649: [0xfeef, 0xfef0, 0xfeef, 0xfef0],
  0x064a: [0xfef1, 0xfef2, 0xfef3, 0xfef4],
  0x0671: [0xfb50, 0xfb51, 0xfb50, 0xfb51],
  0x067e: [0xfb56, 0xfb57, 0xfb58, 0xfb59],
  0x0686: [0xfb7a, 0xfb7b, 0xfb7c, 0xfb7d],
  0x0698: [0xfb8a, 0xfb8b, 0xfb8a, 0xfb8b],
  0x06a9: [0xfb8e, 0xfb8f, 0xfb90, 0xfb91],
  0x06af: [0xfb92, 0xfb93, 0xfb94, 0xfb95],
  0x06ba: [0xfb9e, 0xfb9f, 0xfb9e, 0xfb9f],
  0x06be: [0xfbaa, 0xfbab, 0xfbac, 0xfbad],
  0x06c1: [0xfba6, 0xfba7, 0xfba8, 0xfba9],
  0x06cc: [0xfbfc, 0xfbfd, 0xfbfe, 0xfbff],
  0x06d5: [0xfee9, 0xfeea, 0xfee9, 0xfeea],
};

const DUAL = new Set([
  0x0626, 0x0628, 0x062a, 0x062b, 0x062c, 0x062d, 0x062e, 0x0633, 0x0634,
  0x0635, 0x0636, 0x0637, 0x0638, 0x0639, 0x063a, 0x0641, 0x0642, 0x0643,
  0x0644, 0x0645, 0x0646, 0x0647, 0x064a, 0x067e, 0x0686, 0x06a9, 0x06af,
  0x06be, 0x06c1, 0x06cc,
]);

const RIGHT = new Set([
  0x0622, 0x0623, 0x0624, 0x0625, 0x0627, 0x0629, 0x062f, 0x0630, 0x0631,
  0x0632, 0x0648, 0x0649, 0x0671, 0x0698, 0x06ba, 0x06d5,
]);

const TRANSPARENT = new Set([
  0x064b, 0x064c, 0x064d, 0x064e, 0x064f, 0x0650, 0x0651, 0x0652, 0x0653,
  0x0654, 0x0655, 0x0656, 0x0657, 0x0658, 0x0670, 0x06d6, 0x06d7, 0x06d8,
  0x06d9, 0x06da, 0x06db, 0x06dc, 0x06df, 0x06e0, 0x06e1, 0x06e2, 0x06e3,
  0x06e4, 0x06e7, 0x06e8, 0x06ea, 0x06eb, 0x06ec, 0x06ed,
]);

const LAM = 0x0644;

const ALEF_LIG: Record<number, [isolated: number, final: number]> = {
  0x0622: [0xfef5, 0xfef6],
  0x0623: [0xfef7, 0xfef8],
  0x0625: [0xfef9, 0xfefa],
  0x0627: [0xfefb, 0xfefc],
};

function isArabicChar(cp: number) {
  return (
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0x08a0 && cp <= 0x08ff) ||
    (cp >= 0xfb50 && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfeff)
  );
}

function isStrongRtl(cp: number) {
  return isArabicChar(cp) && !TRANSPARENT.has(cp);
}

function isStrongLtr(cp: number) {
  return (
    (cp >= 0x30 && cp <= 0x39) ||
    (cp >= 0x41 && cp <= 0x5a) ||
    (cp >= 0x61 && cp <= 0x7a) ||
    (cp >= 0xff10 && cp <= 0xff19)
  );
}

function connects(cp: number) {
  return DUAL.has(cp) || RIGHT.has(cp);
}

function nextLetter(cps: number[], i: number) {
  for (let j = i + 1; j < cps.length; j++) {
    if (TRANSPARENT.has(cps[j]!)) continue;
    return cps[j]!;
  }
  return 0;
}

function prevLetter(cps: number[], i: number) {
  for (let j = i - 1; j >= 0; j--) {
    if (TRANSPARENT.has(cps[j]!)) continue;
    return cps[j]!;
  }
  return 0;
}

function reshapeRun(text: string): string {
  const cps = [...text].map((ch) => ch.codePointAt(0)!);
  const out: number[] = [];

  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i]!;

    if (TRANSPARENT.has(cp) || !LETTERS[cp]) {
      out.push(cp);
      continue;
    }

    // Lam + Alef ligatures.
    if (cp === LAM) {
      const next = nextLetter(cps, i);
      const lig = ALEF_LIG[next];

      if (lig) {
        const prev = prevLetter(cps, i);
        const joinPrev = DUAL.has(prev);

        out.push(joinPrev ? lig[1] : lig[0]);

        // Preserve transparent marks between lam and alef, then skip alef.
        let j = i + 1;
        while (j < cps.length && TRANSPARENT.has(cps[j]!)) {
          out.push(cps[j]!);
          j++;
        }

        // j points at alef; skip it and let the loop process the next
        // character normally.
        i = j;
        continue;
      }
    }

    const prev = prevLetter(cps, i);
    const next = nextLetter(cps, i);

    const joinPrev = DUAL.has(prev);
    const joinNext = connects(next) && DUAL.has(cp);

    const forms = LETTERS[cp]!;
    let form: 0 | 1 | 2 | 3 = 0;

    if (joinPrev && joinNext) form = 3;
    else if (joinNext) form = 2;
    else if (joinPrev) form = 1;

    out.push(forms[form]!);
  }

  return String.fromCodePoint(...out);
}

function hasRtl(text: string) {
  for (const ch of text) {
    if (isStrongRtl(ch.codePointAt(0)!)) return true;
  }
  return false;
}

function isNeutral(cp: number) {
  if (cp <= 0x20) return true;

  return (
    " \t.,:;!?/\\|+-()[]{}'\"%#@*&<>=".includes(
      String.fromCodePoint(cp),
    ) ||
    cp === 0x060c || // Arabic comma
    cp === 0x061b || // Arabic semicolon
    cp === 0x061f || // Arabic question mark
    cp === 0x066a || // Arabic percent
    cp === 0x066b || // Arabic decimal separator
    cp === 0x066c    // Arabic thousands separator
  );
}

type Direction = "rtl" | "ltr";

type Run = {
  dir: Direction;
  cps: number[];
};

function resolveDirections(cps: number[], base: Direction): Direction[] {
  const dirs: Direction[] = new Array(cps.length);

  // First assign strong characters.
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i]!;

    if (isStrongRtl(cp)) dirs[i] = "rtl";
    else if (isStrongLtr(cp)) dirs[i] = "ltr";
  }

  // Resolve neutral characters using surrounding strong directions.
  for (let i = 0; i < cps.length; i++) {
    if (dirs[i]) continue;

    let before: Direction | undefined;
    let after: Direction | undefined;

    for (let j = i - 1; j >= 0; j--) {
      if (dirs[j]) {
        before = dirs[j];
        break;
      }
    }

    for (let j = i + 1; j < cps.length; j++) {
      if (dirs[j]) {
        after = dirs[j];
        break;
      }
    }

    if (before && after && before === after) {
      dirs[i] = before;
    } else {
      dirs[i] = before ?? after ?? base;
    }
  }

  return dirs;
}

function buildRuns(cps: number[], base: Direction): Run[] {
  const dirs = resolveDirections(cps, base);
  const runs: Run[] = [];

  for (let i = 0; i < cps.length; i++) {
    const dir = dirs[i]!;
    const last = runs.at(-1);

    if (last && last.dir === dir) {
      last.cps.push(cps[i]!);
    } else {
      runs.push({ dir, cps: [cps[i]!] });
    }
  }

  return runs;
}

export function shapeArabic(text: string): string {
  if (!text) return "";
  if (!hasRtl(text)) return text;

  const original = [...text].map((ch) => ch.codePointAt(0)!);

  // A paragraph containing Arabic is treated as RTL unless its first strong
  // character is Latin/digit.
  let base: Direction = "rtl";
  for (const cp of original) {
    if (isStrongRtl(cp)) {
      base = "rtl";
      break;
    }
    if (isStrongLtr(cp)) {
      base = "ltr";
      break;
    }
  }

  const runs = buildRuns(original, base);

  // Shape only RTL runs. LTR runs stay byte-for-byte in their logical order.
  for (const run of runs) {
    if (run.dir === "rtl") {
      const logical = String.fromCodePoint(...run.cps);
      const shaped = reshapeRun(logical);
      run.cps = [...shaped].map((ch) => ch.codePointAt(0)!);
    }
  }

  const visualRuns = base === "rtl" ? runs.slice().reverse() : runs;

  const visual: number[] = [];

  for (const run of visualRuns) {
    if (run.dir === "rtl") {
      // Presentation forms are still stored in logical character order.
      // pdf-lib needs the visual order, so reverse the RTL run only.
      visual.push(...run.cps.slice().reverse());
    } else {
      visual.push(...run.cps);
    }
  }

  return String.fromCodePoint(...visual);
}

export function containsArabic(text: string) {
  return hasRtl(text);
}
