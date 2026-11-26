// These checks describe the specific public resource, never an appointment slot.
export function hasSourceEvidence(service, text) {
  switch (service.id) {
    case 'catastro-inmueble': {
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return false;
      }
      const rc = data?.consulta_dnprcResult?.bico?.bi?.idbi?.rc;
      if (!rc) return false;
      const reference = [rc.pc1, rc.pc2, rc.car, rc.cc1, rc.cc2].join('');
      return reference === new URL(service.url).searchParams.get('RefCat');
    }
    case 'aeat-cita':
      return /<form\b[^>]*\b(?:id|name)=["']FormParaQuien["']/i.test(text)
        && /<button\b[^>]*\bid=["']btnSiguienteParaQuien["']/i.test(text);
    case 'seg-social-cita':
      return /<a\s[^>]*\bhref=["']https:\/\/w6\.seg-social\.es\/ProsaInternetAnonimo\/OnlineAccess\?[^"']*CPMSWACS[^"']*["']/i.test(text);
    case 'seg-social-cita-reserva': {
      const provinces = text.match(/<Provincias>([\s\S]*?)<\/Provincias>/i);
      if (!provinces) return false;
      const entries = provinces[1].matchAll(/<elementoCombo>([\s\S]*?)<\/elementoCombo>/gi);
      for (const [, entry] of entries) {
        const code = /<codigo>\s*<!\[CDATA\[\d{1,2}\]\]>\s*<\/codigo>/i.test(entry);
        const name = /<descripcion>\s*<!\[CDATA\[\s*[^\s\]][^\]]*\]\]>\s*<\/descripcion>/i.test(entry);
        if (code && name) return true;
      }
      return false;
    }
    case 'sepe-cita': {
      const links = text.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
      const target = new URL('cita-previa/cita-previa-solicitud.html', service.url).href;
      for (const [, href, label] of links) {
        if (!/Iniciar\s+Solicitud/i.test(label.replace(/<[^>]*>/g, ' '))) continue;
        if (URL.canParse(href, service.url) && new URL(href, service.url).href === target) return true;
      }
      return false;
    }
    case 'sepe-cita-aplicacion':
      return /<select\s[^>]*\bid=["']datosIdiomas["']/i.test(text)
        && /<div\s[^>]*\bid=["']tablaCitasPrevias["']/i.test(text);
    default:
      return false;
  }
}
