import * as N3 from 'n3';

export class RDFManuscriptParser {
  constructor() {
    this.store = new N3.Store();
    this.prefixes = {
      dc: 'http://purl.org/dc/elements/1.1/',
      dcterms: 'http://purl.org/dc/terms/',
      schema: 'http://schema.org/',
      crm: 'http://www.cidoc-crm.org/cidoc-crm/',
      edm: 'http://www.europeana.eu/schemas/edm/',
      ms: 'https://w3id.org/manuscript-ar/ontology#',
      rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
      rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
    };
    this.triples = [];
    this.rawTurtle = '';
    this.metadata = null;
    this.hotspots = [];
  }

  async loadFromUrl(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load RDF file (${response.status} ${response.statusText})`);
      }
      const text = await response.text();
      return this.parseTurtle(text);
    } catch (err) {
      console.error('Error fetching RDF data:', err);
      throw err;
    }
  }

  parseTurtle(turtleString) {
    return new Promise((resolve, reject) => {
      this.rawTurtle = turtleString;
      this.store = new N3.Store();
      this.triples = [];

      const parser = new N3.Parser({ format: 'text/turtle' });

      parser.parse(turtleString, (error, quad, prefixes) => {
        if (error) {
          console.error('N3 Parser Error:', error);
          reject(error);
          return;
        }

        if (quad) {
          this.store.addQuad(quad);
          this.triples.push({
            subject: quad.subject.value,
            predicate: quad.predicate.value,
            object: quad.object.value,
            datatype: quad.object.datatype ? quad.object.datatype.value : null,
            language: quad.object.language || null
          });
        } else {
          if (prefixes) {
            this.prefixes = { ...this.prefixes, ...prefixes };
          }
          this._extractMetadata();
          this._extractHotspots();
          resolve({
            metadata: this.metadata,
            hotspots: this.hotspots,
            triples: this.triples,
            tripleCount: this.triples.length
          });
        }
      });
    });
  }

  _getValues(subjectUri, predicateUri) {
    const quads = this.store.getQuads(
      subjectUri ? N3.DataFactory.namedNode(subjectUri) : null,
      predicateUri ? N3.DataFactory.namedNode(predicateUri) : null,
      null,
      null
    );
    return quads.map(q => ({
      value: q.object.value,
      language: q.object.language || '',
      datatype: q.object.datatype ? q.object.datatype.value : ''
    }));
  }

  _getFirstValue(subjectUri, predicateUri, defaultVal = '') {
    const vals = this._getValues(subjectUri, predicateUri);
    return vals.length > 0 ? vals[0].value : defaultVal;
  }

  _extractMetadata() {
    // Find the main manuscript subject
    const manuscriptTypes = [
      'http://schema.org/Manuscript',
      'http://www.cidoc-crm.org/cidoc-crm/E22_Human-Made_Object',
      'http://www.europeana.eu/schemas/edm/ProvidedCHO'
    ];

    let mainSubject = null;
    for (const t of manuscriptTypes) {
      const quads = this.store.getQuads(null, N3.DataFactory.namedNode(this.prefixes.rdf + 'type'), N3.DataFactory.namedNode(t), null);
      if (quads.length > 0) {
        mainSubject = quads[0].subject.value;
        break;
      }
    }

    if (!mainSubject && this.triples.length > 0) {
      mainSubject = this.triples[0].subject;
    }

    const titles = this._getValues(mainSubject, this.prefixes.dc + 'title');
    const titleEn = titles.find(t => t.language === 'en')?.value || titles[0]?.value || 'Manuscript Codex';
    const titleAr = titles.find(t => t.language === 'ar')?.value || '';
    const titleFa = titles.find(t => t.language === 'fa')?.value || '';

    const authorUriOrLiteral = this._getFirstValue(mainSubject, this.prefixes.dc + 'creator');
    let authorName = 'Ibn Sīnā (Avicenna / ابن سینا)';
    let authorJob = 'Polymath & Philosopher';
    let authorBio = '';

    if (authorUriOrLiteral) {
      if (authorUriOrLiteral.startsWith('http')) {
        const authorQuads = this.store.getQuads(N3.DataFactory.namedNode(authorUriOrLiteral), null, null, null);
        for (const q of authorQuads) {
          if (q.predicate.value === this.prefixes.rdfs + 'label' || q.predicate.value === this.prefixes.schema + 'name') {
            authorName = q.object.value;
          }
          if (q.predicate.value === this.prefixes.schema + 'jobTitle') {
            authorJob = q.object.value;
          }
          if (q.predicate.value === this.prefixes.schema + 'description') {
            authorBio = q.object.value;
          }
        }
      } else {
        // It's a literal!
        authorName = authorUriOrLiteral;
        authorJob = '';
      }
    }

    this.metadata = {
      uri: mainSubject,
      title: titleEn,
      titleArabic: titleAr,
      titlePersian: titleFa,
      creator: authorName,
      authorJob,
      authorBio,
      date: this._getFirstValue(mainSubject, this.prefixes.dc + 'date', '16th-17th Century CE'),
      contributor: this._getFirstValue(mainSubject, this.prefixes.dc + 'contributor', ''),
      format: this._getFirstValue(mainSubject, this.prefixes.dc + 'format', 'Illuminated Codex'),
      identifier: this._getFirstValue(mainSubject, this.prefixes.dc + 'identifier', ''),
      publisher: this._getFirstValue(mainSubject, this.prefixes.schema + 'publisher', 'Parliament Library of Iran'),
      material: this._getFirstValue(mainSubject, this.prefixes.schema + 'material', 'Handmade rag paper, shell gold, lapis lazuli, iron gall ink'),
      dimensions: this._getFirstValue(mainSubject, this.prefixes.schema + 'extent', '26.5 cm x 17.2 cm'),
      folioLayout: this._getFirstValue(mainSubject, this.prefixes.ms + 'folioLayout', ''),
      transcriptionArabic: this._getFirstValue(mainSubject, this.prefixes.ms + 'transcriptionArabic', ''),
      translationEnglish: this._getFirstValue(mainSubject, this.prefixes.ms + 'translationEnglish', '')
    };
  }

  _extractHotspots() {
    this.hotspots = [];
    const hotspotType = this.prefixes.ms + 'SpatialHotspot';
    const quads = this.store.getQuads(null, N3.DataFactory.namedNode(this.prefixes.rdf + 'type'), N3.DataFactory.namedNode(hotspotType), null);

    for (const q of quads) {
      const subject = q.subject.value;
      const label = this._getFirstValue(subject, this.prefixes.rdfs + 'label', 'Annotation Pin');
      const desc = this._getFirstValue(subject, this.prefixes.dc + 'description', '');
      const folio = this._getFirstValue(subject, this.prefixes.ms + 'targetFolio', 'Recto');
      const normX = parseFloat(this._getFirstValue(subject, this.prefixes.ms + 'normalizedX', '0.5'));
      const normY = parseFloat(this._getFirstValue(subject, this.prefixes.ms + 'normalizedY', '0.5'));
      const elevZ = parseFloat(this._getFirstValue(subject, this.prefixes.ms + 'elevationZ', '0.05'));

      this.hotspots.push({
        id: subject,
        label,
        description: desc,
        folio,
        normX,
        normY,
        elevZ
      });
    }

    // Default hotspots if none found
    if (this.hotspots.length === 0) {
      this.hotspots = [
        {
          id: 'unwan',
          label: 'Illuminated ʿUnwān Headpiece',
          description: 'Lapis lazuli and 24K gold floral arabesque dome headpiece.',
          folio: 'Recto (Right)',
          normX: 0.72,
          normY: 0.22,
          elevZ: 0.08
        },
        {
          id: 'basmala',
          label: 'The Basmala Calligraphy',
          description: 'Fine Thuluth invocation within gold cloudband cartouche.',
          folio: 'Recto (Right)',
          normX: 0.72,
          normY: 0.42,
          elevZ: 0.06
        },
        {
          id: 'text',
          label: 'Philosophical Treatise (Avicenna)',
          description: 'Metaphysical discourse on origination (ibdāʿ) and cosmic formation.',
          folio: 'Verso (Left)',
          normX: 0.32,
          normY: 0.38,
          elevZ: 0.07
        },
        {
          id: 'seal',
          label: 'Majlis Library Seal',
          description: 'Historical ownership seal of National Parliament Library (1302 AH).',
          folio: 'Recto Lower Right',
          normX: 0.88,
          normY: 0.82,
          elevZ: 0.05
        }
      ];
    }
  }

  getGraphData() {
    const nodes = new Map();
    const links = [];

    const shortenUri = (uri) => {
      if (!uri) return '';
      for (const [prefix, full] of Object.entries(this.prefixes)) {
        if (uri.startsWith(full)) {
          return `${prefix}:${uri.slice(full.length)}`;
        }
      }
      if (uri.startsWith('http')) {
        const parts = uri.split(/[\/#]/);
        return parts[parts.length - 1] || uri;
      }
      return uri;
    };

    this.triples.forEach((t) => {
      const sId = shortenUri(t.subject);
      const oId = t.object.startsWith('http') ? shortenUri(t.object) : (t.object.length > 35 ? t.object.slice(0, 32) + '...' : t.object);
      const pLabel = shortenUri(t.predicate);

      if (!nodes.has(sId)) {
        nodes.set(sId, {
          id: sId,
          fullUri: t.subject,
          type: 'resource',
          group: 1
        });
      }

      const isLiteral = !t.object.startsWith('http');
      const objKey = isLiteral ? `lit_${links.length}` : oId;

      if (!nodes.has(objKey)) {
        nodes.set(objKey, {
          id: objKey,
          label: oId,
          fullUri: t.object,
          type: isLiteral ? 'literal' : 'resource',
          group: isLiteral ? 2 : 3
        });
      }

      links.push({
        source: sId,
        target: objKey,
        predicate: pLabel,
        fullPredicate: t.predicate
      });
    });

    return {
      nodes: Array.from(nodes.values()),
      links
    };
  }
}
