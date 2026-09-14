
// BioDynaMit — migration automatique du stockage historique
// Charge ce fichier APRES app.js dans index.html.

(function () {
  const STORAGE_VERSION = "1.0";

  function norm(v) {
    return String(v ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function compact(v) {
    return norm(v).replace(/\s+/g, "");
  }

  function tableRows(table) {
    if (!table) return [];
    if (Array.isArray(table)) return table;
    if (table.records && Array.isArray(table.records)) return table.records;

    const keys = Object.keys(table);
    const n = Math.max(0, ...keys.map(k => Array.isArray(table[k]) ? table[k].length : 0));
    return Array.from({length:n}, (_, i) =>
      Object.fromEntries(keys.map(k => [k, Array.isArray(table[k]) ? table[k][i] : undefined]))
    );
  }

  function detectSourceTable(kind) {
    const candidates = state.tables || [];
    if (kind === "T20") {
      return candidates.find(t => /t?20c.*antibod.*storage/i.test(t))
        || candidates.find(t => /20c.*storage/i.test(t));
    }
    return candidates.find(t => /t?4c.*antibod.*storage/i.test(t))
      || candidates.find(t => /(^|_)4c.*storage/i.test(t));
  }

  function findAntibody(cellText, antibodies) {
    const textNorm = norm(cellText);
    const textCompact = compact(cellText);

    // 1) Référence catalogue : priorité absolue.
    const byCatalog = antibodies.filter(a => {
      const cat = compact(a.CatalogNumber);
      return cat && cat.length >= 4 && textCompact.includes(cat);
    });
    if (byCatalog.length === 1) return {row:byCatalog[0], confidence:"catalog"};
    if (byCatalog.length > 1) {
      const withSupplier = byCatalog.find(a => {
        const s = norm(a.Supplier);
        return s && s.length >= 4 && textNorm.includes(s);
      });
      if (withSupplier) return {row:withSupplier, confidence:"catalog+supplier"};
      return {row:byCatalog[0], confidence:"catalog-ambiguous"};
    }

    // 2) Fournisseur + nom.
    const byNameSupplier = antibodies.filter(a => {
      const name = norm(a.Name || a.FullName);
      const supplier = norm(a.Supplier);
      const nameOk = name && name.length >= 4 && (textNorm.includes(name) || name.includes(textNorm.split("\n")[0] || ""));
      const supplierOk = supplier && supplier.length >= 4 && textNorm.includes(supplier);
      return nameOk && supplierOk;
    });
    if (byNameSupplier.length === 1) return {row:byNameSupplier[0], confidence:"name+supplier"};

    // 3) Nom seul, seulement s'il est assez spécifique.
    const byName = antibodies.filter(a => {
      const name = norm(a.Name || a.FullName);
      return name && name.length >= 5 && textNorm.includes(name);
    });
    if (byName.length === 1) return {row:byName[0], confidence:"name"};

    return {row:null, confidence:"unmatched"};
  }

  function parseBox(rawRows, spec, antibodies) {
    const out = [];
    for (const r of rawRows) {
      const rowLabel = String(r[spec.rowLabelCol] ?? "").trim().toUpperCase();
      if (!/^[A-J]$/.test(rowLabel)) continue;

      spec.dataCols.forEach((col, idx) => {
        const slot = `${rowLabel}${idx + 1}`;
        const rawValue = String(r[col] ?? "").trim();
        const occupied = rawValue.length > 0;

        let match = {row:null, confidence:"empty"};
        if (occupied) match = findAntibody(rawValue, antibodies);

        out.push({
          slot,
          rawValue,
          occupied,
          antibodyId: match.row ? Number(match.row.id) : 0,
          confidence: match.confidence
        });
      });
    }
    return out;
  }

  function bulkPayload(records) {
    if (!records.length) return {};
    const cols = Object.keys(records[0]);
    return Object.fromEntries(cols.map(c => [c, records.map(r => r[c])]));
  }

  async function addBulk(table, records) {
    if (!records.length) return;
    await grist.docApi.applyUserActions([
      ["BulkAddRecord", table, Array(records.length).fill(null), bulkPayload(records)]
    ]);
  }

  async function migrateStorage() {
    if (!state.connected) return toast("Cette migration doit être lancée depuis Grist.");
    if (!schemaReady()) return toast("La structure BioDynaMit doit d'abord être initialisée.");

    await loadAll();

    if (tableRows(state.data.Boxes).length || tableRows(state.data.Vials).length || tableRows(state.data.Positions).length) {
      return toast("Boxes, Vials ou Positions contiennent déjà des données. Migration stockage annulée pour éviter les doublons.");
    }

    const src20 = detectSourceTable("T20");
    const src4 = detectSourceTable("T4");
    if (!src20 || !src4) {
      return toast(`Tables de stockage introuvables. Détecté -20°C: ${src20 || "non"} ; +4°C: ${src4 || "non"}.`);
    }

    if (!confirm(
      "Importer le stockage existant ?\n\n" +
      "Cette opération créera 3 boîtes, 300 positions et un vial pour chaque cellule occupée. " +
      "Les tables Excel sources resteront intactes."
    )) return;

    const antibodies = tableRows(state.data.Antibodies);
    const raw20 = tableRows(await grist.docApi.fetchTable(src20));
    const raw4 = tableRows(await grist.docApi.fetchTable(src4));

    const specs = [
      {
        code:"BOX-T20-1", name:"Boîte -20°C 1", temperature:"-20°C",
        source:src20, raw:raw20, rowLabelCol:"A",
        dataCols:["B","C","D","E","F","G","H","I","J","K"]
      },
      {
        code:"BOX-T20-2", name:"Boîte -20°C 2", temperature:"-20°C",
        source:src20, raw:raw20, rowLabelCol:"L",
        dataCols:["M","N","O","P","Q","R","S","T","U","V"]
      },
      {
        code:"BOX-T4-1", name:"Boîte +4°C 1", temperature:"+4°C",
        source:src4, raw:raw4, rowLabelCol:"A",
        dataCols:["B","C","D","E","F","G","H","I","J","K"]
      }
    ];

    toast("Migration du stockage en cours…");

    // 1. Créer les 3 boîtes.
    for (const s of specs) {
      await grist.docApi.applyUserActions([[
        "AddRecord", "Boxes", null,
        {
          Code:s.code, Name:s.name, Temperature:s.temperature, Rack:"",
          Rows:10, Columns:10,
          Notes:`Import automatique depuis ${s.source} — BioDynaMit storage migration ${STORAGE_VERSION}`
        }
      ]]);
    }

    await loadAll();
    const boxes = tableRows(state.data.Boxes);

    // 2. Analyser les cellules et préparer les vials.
    const parsed = [];
    let vialCounter = 1;
    for (const s of specs) {
      const box = boxes.find(b => b.Code === s.code);
      if (!box) throw new Error(`Boîte ${s.code} introuvable après création.`);

      const cells = parseBox(s.raw, s, antibodies);
      for (const c of cells) {
        c.boxId = Number(box.id);
        c.boxCode = s.code;
        c.boxName = s.name;
        c.temperature = s.temperature;

        if (c.occupied) {
          c.vialCode = `V-STOCK-${String(vialCounter++).padStart(4,"0")}`;
          c.vialComments =
            `Import depuis ${s.source} / ${s.name} / ${c.slot}\n` +
            `Matching: ${c.confidence}\n` +
            `Valeur source:\n${c.rawValue}`;
        }
        parsed.push(c);
      }
    }

    const occupied = parsed.filter(c => c.occupied);
    const vialRecords = occupied.map(c => ({
      Code:c.vialCode,
      Antibody:c.antibodyId || 0,
      FillStatus:"Inconnu",
      EstimatedVolume_uL:null,
      Status:"En stock",
      Comments:c.vialComments
    }));
    await addBulk("Vials", vialRecords);

    await loadAll();
    const vials = tableRows(state.data.Vials);
    const vialByCode = new Map(vials.map(v => [v.Code, v]));

    // 3. Créer les 300 positions, occupées ou libres.
    const positionRecords = parsed.map(c => {
      const vial = c.occupied ? vialByCode.get(c.vialCode) : null;
      return {
        Code:`${c.boxCode}-${c.slot}`,
        Box:c.boxId,
        Slot:c.slot,
        Vial:vial ? Number(vial.id) : 0,
        Available:!c.occupied,
        Notes:c.occupied && !c.antibodyId
          ? `Correspondance anticorps à vérifier. Source: ${c.rawValue}`
          : ""
      };
    });
    await addBulk("Positions", positionRecords);

    // 4. Historique.
    const unmatched = occupied.filter(c => !c.antibodyId);
    await grist.docApi.applyUserActions([[
      "AddRecord", "History", null,
      {
        Date:Date.now()/1000,
        Action:"Migration stockage",
        EntityType:"Storage",
        EntityCode:"",
        Details:`3 boîtes, 300 positions, ${occupied.length} vials importés. ${unmatched.length} correspondances anticorps à vérifier.`,
        User:"Grist"
      }
    ]]);

    await loadAll();

    alert(
      `Migration terminée.\n\n` +
      `Boîtes créées : 3\n` +
      `Positions : 300\n` +
      `Vials importés : ${occupied.length}\n` +
      `À vérifier : ${unmatched.length}\n\n` +
      `Les tables Excel sources n'ont pas été modifiées.`
    );

    go("storage");
  }

  // Expose la fonction pour dépannage éventuel.
  window.migrateStorage = migrateStorage;

  // Étend la page Administration déjà définie dans app.js.
  const originalAdmin = admin;
  admin = function () {
    originalAdmin();

    const cards = content.querySelectorAll(".card");
    const test3DCard = Array.from(cards).find(c => /Test 3D/i.test(c.textContent || ""));
    const migrationCard = document.createElement("div");
    migrationCard.className = "card card-pad";
    migrationCard.style.marginTop = "14px";
    migrationCard.innerHTML = `
      <h3 class="section-title">Migration du stockage réel</h3>
      <p>
        Reconstruit automatiquement les 2 boîtes -20°C et la boîte +4°C depuis les plans Excel d'origine.
        Les sources restent intactes.
      </p>
      <button class="btn btn-primary" id="migrateStorageReal" ${schemaReady() ? "" : "disabled"}>
        Importer les boîtes, vials et positions
      </button>
      <p style="color:var(--muted);font-size:12px;margin-top:8px">
        Sécurité : l'import est bloqué si Boxes, Vials ou Positions contiennent déjà des données.
      </p>
    `;

    if (test3DCard) test3DCard.before(migrationCard);
    else content.appendChild(migrationCard);

    const btn = document.querySelector("#migrateStorageReal");
    if (btn) btn.onclick = migrateStorage;
  };
})();
