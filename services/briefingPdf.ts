/**
 * Client-facing briefing export.
 *
 * Lifted out of the form component: this is 150 lines of document markup that
 * had nothing to do with rendering the UI. The PDF keeps its own corporate
 * palette on purpose — it is a deliverable handed to a client, not a view of
 * the app.
 */

export interface BriefingDocument {
  topic: string;
  characterDescription: string | null;
  referenceUrl: string;
  styleAnalysis: string;
  /** `data:` URLs, already loaded by the form. */
  influencerPreview: string | null;
  logoPreview: string | null;
}

const BRAND_ACCENT = '#00a1e0';
const BRAND_DARK = '#1a1f36';
const BRAND_GRADIENT = 'linear-gradient(135deg, #090947 0%, #1a237e 100%)';

/** Everything below is injected as innerHTML, so every value is escaped first. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function markdownToHtml(text: string): string {
  if (!text) return '';
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#000;font-weight:700;">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em style="color:#475569;">$1</em>')
    .replace(
      /^[*-]\s+(.*)$/gm,
      '<div style="margin-left:15px;margin-bottom:6px;display:flex;align-items:flex-start;">' +
        `<span style="color:${BRAND_ACCENT};margin-right:8px;font-weight:bold;">•</span>` +
        '<span style="flex:1;color:#444;line-height:1.5;">$1</span></div>'
    )
    .replace(
      /^##\s+(.*)$/gm,
      `<h3 style="font-size:14px;font-weight:700;color:${BRAND_DARK};margin:15px 0 8px;border-left:3px solid ${BRAND_ACCENT};padding-left:8px;">$1</h3>`
    )
    .replace(/^###\s+(.*)$/gm, '<h4 style="font-size:12px;font-weight:600;color:#334155;margin:10px 0 5px;">$1</h4>')
    .replace(/\n\n/g, '<div style="height:10px;"></div>')
    .replace(/\n/g, '<br/>');
}

function buildMarkup(doc: BriefingDocument): string {
  const date = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  const coverStyle = `width:595px;height:842px;background:${BRAND_GRADIENT};color:white;position:relative;display:flex;flex-direction:column;justify-content:center;padding:60px;box-sizing:border-box;`;
  const pageStyle =
    'width:595px;min-height:842px;background:white;padding:50px 50px 40px;box-sizing:border-box;position:relative;';
  const sectionTitle = `font-size:28px;font-weight:700;color:${BRAND_ACCENT};margin-bottom:20px;letter-spacing:-0.5px;`;
  const body = 'font-size:11px;color:#444;line-height:1.6;text-align:justify;';

  const logoBlock = doc.logoPreview
    ? `<img src="${doc.logoPreview}" style="height:40px;background:white;padding:5px;border-radius:4px;" alt="" />`
    : `<div style="font-weight:800;font-size:20px;">Influencer<span style="color:${BRAND_ACCENT}">Labs</span></div>`;

  const personaSection = doc.characterDescription
    ? `<div style="margin-bottom:40px;">
         <h2 style="${sectionTitle}">2. Persona da Influencer</h2>
         <div style="display:flex;gap:20px;align-items:flex-start;">
           ${
             doc.influencerPreview
               ? `<div style="flex-shrink:0;width:120px;height:120px;border-radius:20px;overflow:hidden;box-shadow:0 10px 20px rgba(0,0,0,0.1);">
                    <img src="${doc.influencerPreview}" style="width:100%;height:100%;object-fit:cover;" alt="" />
                  </div>`
               : ''
           }
           <div style="flex:1;">
             <div style="font-size:16px;font-weight:700;color:${BRAND_DARK};margin-bottom:10px;">Perfil analítico</div>
             <div style="${body}color:#64748b;">${escapeHtml(doc.characterDescription)}</div>
           </div>
         </div>
       </div>`
    : '';

  const styleSection =
    doc.referenceUrl || doc.styleAnalysis
      ? `<div style="margin-bottom:40px;">
           <h2 style="${sectionTitle}">3. Referência &amp; Estilo</h2>
           <div style="background:${BRAND_DARK};color:white;padding:25px;border-radius:15px;position:relative;overflow:hidden;">
             <div style="position:absolute;top:-10px;right:-10px;width:60px;height:60px;background:${BRAND_ACCENT};border-radius:50%;opacity:0.2;"></div>
             ${
               doc.referenceUrl
                 ? `<div style="margin-bottom:15px;font-size:10px;opacity:0.85;">
                      <strong style="text-transform:uppercase;color:${BRAND_ACCENT};">URL de referência</strong><br/>
                      ${escapeHtml(doc.referenceUrl)}
                    </div>`
                 : ''
             }
             ${
               doc.styleAnalysis
                 ? `<div style="font-family:'Courier New',monospace;font-size:10px;line-height:1.5;border-left:2px solid ${BRAND_ACCENT};padding-left:10px;">
                      ${escapeHtml(doc.styleAnalysis).replace(/\n/g, '<br/>')}
                    </div>`
                 : ''
             }
           </div>
         </div>`
      : '';

  return `<div>
    <div style="${coverStyle}">
      <div style="position:absolute;top:50px;right:50px;">${logoBlock}</div>
      <div style="margin-bottom:auto;margin-top:100px;">
        <h1 style="font-size:42px;font-weight:800;line-height:1.1;margin-bottom:20px;color:white;">
          Briefing de<br/><span style="color:${BRAND_ACCENT}">Campanha UGC</span><br/>gerada por IA
        </h1>
        <p style="font-size:14px;font-weight:300;margin-top:20px;opacity:0.9;max-width:400px;line-height:1.5;">
          Estratégia, persona e direção de estilo definidas para a produção de vídeo.
        </p>
      </div>
      <div style="margin-top:40px;border-top:1px solid rgba(255,255,255,0.2);padding-top:20px;">
        <p style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${BRAND_ACCENT};margin-bottom:5px;">Data</p>
        <p style="font-size:12px;">${date}</p>
      </div>
      <div style="position:absolute;bottom:-50px;right:-50px;width:250px;height:250px;background:radial-gradient(circle,${BRAND_ACCENT} 0%,transparent 70%);opacity:0.4;border-radius:50%;"></div>
    </div>

    <div style="${pageStyle}">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${BRAND_ACCENT};padding-bottom:15px;margin-bottom:40px;">
        <span style="color:${BRAND_DARK};font-weight:700;font-size:14px;">InfluencerLabs</span>
        <span style="color:#94a3b8;font-size:10px;text-transform:uppercase;">Briefing executivo</span>
      </div>

      <div style="margin-bottom:40px;">
        <h2 style="${sectionTitle}">1. Estratégia &amp; Contexto</h2>
        <div style="${body}background:#f8fafc;padding:20px;border-radius:0 15px 15px 15px;border-left:4px solid ${BRAND_ACCENT};">
          ${markdownToHtml(doc.topic)}
        </div>
      </div>

      ${personaSection}
      ${styleSection}

      <div style="position:absolute;bottom:0;left:0;right:0;height:60px;pointer-events:none;overflow:hidden;">
        <svg viewBox="0 0 1440 320" preserveAspectRatio="none" style="height:100%;width:100%;">
          <path fill="#f1f5f9" d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,224C672,245,768,267,864,261.3C960,256,1056,224,1152,197.3C1248,171,1344,149,1392,138.7L1440,128L1440,320L0,320Z"></path>
        </svg>
      </div>
      <div style="position:absolute;bottom:20px;right:50px;font-size:10px;color:#94a3b8;">Página 02</div>
    </div>
  </div>`;
}

/** Renders the briefing and triggers the browser download. */
export async function exportBriefingPdf(doc: BriefingDocument): Promise<void> {
  // jsPDF and html2canvas together outweigh the rest of the app, and only this
  // one action needs them, so they are fetched on demand.
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);

  // jsPDF's html() looks for html2canvas on the window when it is not bundled.
  if (!(window as any).html2canvas) {
    (window as any).html2canvas = html2canvas;
  }

  const pdf = new jsPDF('p', 'pt', 'a4');

  const scaffold = document.createElement('div');
  scaffold.style.cssText =
    'width:595px;position:fixed;top:0;left:-9999px;background:#fff;box-sizing:border-box;' +
    'font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;';
  scaffold.innerHTML = buildMarkup(doc);
  document.body.appendChild(scaffold);

  try {
    // Give the embedded data-URL images a frame to decode before rasterizing.
    await new Promise((resolve) => setTimeout(resolve, 800));

    await pdf.html(scaffold, {
      callback: (rendered) => rendered.save('InfluencerLabs_Briefing.pdf'),
      x: 0,
      y: 0,
      width: 595.28,
      windowWidth: 595,
      autoPaging: 'text',
      html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
    });
  } finally {
    // Always detach the off-screen scaffold, even if rendering threw.
    scaffold.remove();
  }
}
