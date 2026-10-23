// Chuyển cây công thức (lib/export/latex.ts) sang công thức Word thật (OMML qua thư viện docx).
// Cấu trúc không dựng được (ma trận, dấu vector...) rơi về chuỗi Unicode đọc được, không bao giờ để $...$ thô.
import {
  Math as DocxMath,
  MathAngledBrackets,
  MathCurlyBrackets,
  MathFraction,
  MathIntegral,
  MathRadical,
  MathRoundBrackets,
  MathRun,
  MathSquareBrackets,
  MathSubScript,
  MathSubSuperScript,
  MathSum,
  MathSuperScript,
  type MathComponent,
} from 'docx';
import { nodesToUnicode, parseLatex, type MNode } from './latex';

const run = (t: string) => new MathRun(t);

/** Đảm bảo luôn có ít nhất một phần tử (Word không chấp nhận khung rỗng). */
function nonEmpty(list: MathComponent[]): MathComponent[] {
  return list.length ? list : [run('')];
}

export function nodesToMath(list: MNode[]): MathComponent[] {
  const out: MathComponent[] = [];
  for (const n of list) {
    switch (n.t) {
      case 'run':
        if (n.text) out.push(run(n.text));
        break;
      case 'br':
        out.push(run(' '));
        break;
      case 'frac':
        out.push(new MathFraction({ numerator: nonEmpty(nodesToMath(n.num)), denominator: nonEmpty(nodesToMath(n.den)) }));
        break;
      case 'sqrt':
        out.push(
          new MathRadical({
            children: nonEmpty(nodesToMath(n.body)),
            ...(n.deg && n.deg.length ? { degree: nonEmpty(nodesToMath(n.deg)) } : {}),
          }),
        );
        break;
      case 'sup':
        out.push(new MathSuperScript({ children: nonEmpty(nodesToMath(n.base)), superScript: nonEmpty(nodesToMath(n.sup)) }));
        break;
      case 'sub':
        out.push(new MathSubScript({ children: nonEmpty(nodesToMath(n.base)), subScript: nonEmpty(nodesToMath(n.sub)) }));
        break;
      case 'subsup':
        out.push(
          new MathSubSuperScript({
            children: nonEmpty(nodesToMath(n.base)),
            subScript: nonEmpty(nodesToMath(n.sub)),
            superScript: nonEmpty(nodesToMath(n.sup)),
          }),
        );
        break;
      case 'delim': {
        const body = nonEmpty(nodesToMath(n.body));
        if (n.open === '(' && n.close === ')') out.push(new MathRoundBrackets({ children: body }));
        else if (n.open === '[' && n.close === ']') out.push(new MathSquareBrackets({ children: body }));
        else if (n.open === '{' && n.close === '}') out.push(new MathCurlyBrackets({ children: body }));
        else if (n.open === '⟨' && n.close === '⟩') out.push(new MathAngledBrackets({ children: body }));
        else out.push(run(n.open), ...body, run(n.close));
        break;
      }
      case 'nary': {
        const body = nonEmpty(nodesToMath(n.body));
        const sub = n.sub && n.sub.length ? nodesToMath(n.sub) : undefined;
        const sup = n.sup && n.sup.length ? nodesToMath(n.sup) : undefined;
        if (n.op === '∑') out.push(new MathSum({ children: body, ...(sub ? { subScript: sub } : {}), ...(sup ? { superScript: sup } : {}) }));
        else if (n.op === '∫') out.push(new MathIntegral({ children: body, ...(sub ? { subScript: sub } : {}), ...(sup ? { superScript: sup } : {}) }));
        else out.push(run(nodesToUnicode([{ ...n, body: [] }])), ...body);
        break;
      }
      case 'env': {
        if (n.name === 'cases') {
          // Hệ phương trình: mỗi dòng một vế, nối bằng dấu chấm phẩy, mở bằng dấu {.
          out.push(run('{ '));
          n.rows.forEach((row, i) => {
            if (i > 0) out.push(run(' ;  '));
            row.forEach((cell, c) => {
              if (c > 0) out.push(run(' '));
              out.push(...nodesToMath(cell));
            });
          });
        } else {
          out.push(run(nodesToUnicode([n])));
        }
        break;
      }
      case 'accent':
      default:
        out.push(run(nodesToUnicode([n])));
    }
  }
  return out;
}

/** Một đoạn LaTeX -> thành phần Math của Word. */
export function latexToDocxMath(src: string): DocxMath {
  let children: MathComponent[];
  try {
    children = nodesToMath(parseLatex(src));
  } catch {
    children = [run(String(src ?? '').replace(/[\${}]/g, ''))];
  }
  return new DocxMath({ children: nonEmpty(children) });
}
