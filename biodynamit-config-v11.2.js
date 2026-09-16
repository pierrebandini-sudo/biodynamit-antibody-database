/* BioDynaMit v11.2 — configuration layer and dynamic Administration.
   Additive only: no legacy migration is run automatically.
*/
(function(){
  'use strict';

  const core=window.BioDynaMitCoreV112;
  if(!core){ console.error('BioDynaMit v11.2: core engine missing.'); return; }

  const ns=window.BioDynaMitV112=window.BioDynaMitV112||{};
  ns.version='11.2.0';
  ns.adminTab=ns.adminTab||'overview';
  ns.data=ns.data||{};
  ns.lastIntegrity=null;

  const SCHEMAS={
    InventoryTypes:[
      {id:'Key',type:'Text'},{id:'Name',type:'Text'},{id:'SingularName',type:'Text'},{id:'Icon',type:'Text'},
      {id:'Mode',type:'Text'},{id:'Enabled',type:'Bool'},{id:'StorageEnabled',type:'Bool'},
      {id:'TemperatureHint',type:'Text'},{id:'UnitLabel',type:'Text'},{id:'SortOrder',type:'Int'},{id:'Notes',type:'Text'}
    ],
    FieldDefinitions:[
      {id:'InventoryType',type:'Text'},{id:'FieldKey',type:'Text'},{id:'Label',type:'Text'},{id:'DataType',type:'Text'},
      {id:'Required',type:'Bool'},{id:'Visible',type:'Bool'},{id:'Searchable',type:'Bool'},{id:'Section',type:'Text'},
      {id:'SortOrder',type:'Int'},{id:'StorageMode',type:'Text'},{id:'ColumnName',type:'Text'},{id:'ChoiceGroup',type:'Text'},
      {id:'HelpText',type:'Text'},{id:'Active',type:'Bool'}
    ],
    ChoiceOptions:[
      {id:'GroupKey',type:'Text'},{id:'Value',type:'Text'},{id:'Label',type:'Text'},{id:'SortOrder',type:'Int'},{id:'Active',type:'Bool'}
    ],
    SupplierConfig:[
      {id:'Name',type:'Text'},{id:'CanonicalName',type:'Text'},{id:'Domains',type:'Text'},{id:'Aliases',type:'Text'},
      {id:'SearchTemplate',type:'Text'},{id:'Active',type:'Bool'},{id:'Notes',type:'Text'}
    ],
    Synonyms:[
      {id:'Scope',type:'Text'},{id:'Canonical',type:'Text'},{id:'Alias',type:'Text'},{id:'Active',type:'Bool'},{id:'Notes',type:'Text'}
    ],
    FeatureFlags:[
      {id:'Key',type:'Text'},{id:'Enabled',type:'Bool'},{id:'Value',type:'Text'},{id:'Scope',type:'Text'},{id:'Description',type:'Text'}
    ],
    AutomationRules:[
      {id:'Key',type:'Text'},{id:'Name',type:'Text'},{id:'Event',type:'Text'},{id:'EntityType',type:'Text'},
      {id:'Field',type:'Text'},{id:'Operator',type:'Text'},{id:'CompareValue',type:'Text'},{id:'Action',type:'Text'},
      {id:'ActionValue',type:'Text'},{id:'Priority',type:'Int'},{id:'Enabled',type:'Bool'},{id:'Description',type:'Text'}
    ],
    AlertRules:[
      {id:'Key',type:'Text'},{id:'Name',type:'Text'},{id:'EntityType',type:'Text'},{id:'Field',type:'Text'},
      {id:'Operator',type:'Text'},{id:'CompareValue',type:'Text'},{id:'Severity',type:'Text'},{id:'Message',type:'Text'},
      {id:'Priority',type:'Int'},{id:'Enabled',type:'Bool'}
    ],
    WatchProfiles:[
      {id:'Key',type:'Text'},{id:'Name',type:'Text'},{id:'Enabled',type:'Bool'},{id:'CurrentYearOnly',type:'Bool'},
      {id:'ArchiveYears',type:'Int'},{id:'MaxResults',type:'Int'},{id:'RefreshDays',type:'Int'},{id:'Notes',type:'Text'}
    ],
    WatchTerms:[
      {id:'ProfileKey',type:'Text'},{id:'Kind',type:'Text'},{id:'Term',type:'Text'},{id:'Weight',type:'Numeric'},{id:'Active',type:'Bool'}
    ],
    WatchScoring:[
      {id:'ProfileKey',type:'Text'},{id:'Factor',type:'Text'},{id:'Weight',type:'Numeric'},{id:'Active',type:'Bool'},{id:'Notes',type:'Text'}
    ],
    ImportProfiles:[
      {id:'Key',type:'Text'},{id:'Name',type:'Text'},{id:'InventoryType',type:'Text'},{id:'SourceSheetPattern',type:'Text'},
      {id:'HeaderRow',type:'Int'},{id:'MappingJSON',type:'Text'},{id:'MatchKeys',type:'Text'},{id:'StorageProfile',type:'Text'},
      {id:'Enabled',type:'Bool'},{id:'Notes',type:'Text'}
    ],
    ConfigVersions:[
      {id:'Date',type:'DateTime'},{id:'Version',type:'Text'},{id:'User',type:'Text'},{id:'Summary',type:'Text'},{id:'SnapshotJSON',type:'Text'}
    ],
    InventoryItems:[
      {id:'Code',type:'Text'},{id:'InventoryType',type:'Text'},{id:'Name',type:'Text'},{id:'Status',type:'Text'},{id:'Active',type:'Bool'},
      {id:'Supplier',type:'Text'},{id:'CatalogNumber',type:'Text'},{id:'Target',type:'Text'},{id:'TargetSpecies',type:'Text'},
      {id:'HostSpecies',type:'Text'},{id:'Fluorophore',type:'Text'},{id:'Excitation_nm',type:'Numeric'},{id:'Emission_nm',type:'Numeric'},
      {id:'StorageTemperature',type:'Text'},{id:'Class',type:'Text'},{id:'Website',type:'Text'},{id:'Comments',type:'Text'},
      {id:'RawTable',type:'Text'},{id:'RawRowId',type:'Int'}
    ],
    InventoryAttributes:[
      {id:'Item',type:'Ref:InventoryItems'},{id:'InventoryType',type:'Text'},{id:'FieldKey',type:'Text'},{id:'ValueText',type:'Text'},
      {id:'ValueNumber',type:'Numeric'},{id:'ValueDate',type:'Date'},{id:'ValueBool',type:'Bool'},{id:'Source',type:'Text'}
    ],
    InventoryContainers:[
      {id:'Code',type:'Text'},{id:'InventoryType',type:'Text'},{id:'Name',type:'Text'},{id:'Temperature',type:'Text'},
      {id:'Rack',type:'Text'},{id:'Rows',type:'Int'},{id:'Columns',type:'Int'},
      {id:'GridOrientation',type:'Text'},{id:'StorageProfile',type:'Text'},{id:'DisplayStyle',type:'Text'},{id:'Subtitle',type:'Text'},
      {id:'Notes',type:'Text'},{id:'Active',type:'Bool'}
    ],
    InventoryUnits:[
      {id:'Code',type:'Text'},{id:'InventoryType',type:'Text'},{id:'Item',type:'Ref:InventoryItems'},{id:'FillStatus',type:'Text'},
      {id:'EstimatedVolume_uL',type:'Numeric'},{id:'Status',type:'Text'},{id:'DateReceived',type:'Date'},{id:'Comments',type:'Text'},
      {id:'RawLabel',type:'Text'},{id:'MatchStatus',type:'Text'},{id:'MatchScore',type:'Numeric'},{id:'CandidateItemCode',type:'Text'},
      {id:'DetectedHost',type:'Text'},{id:'DetectedTargetSpecies',type:'Text'},{id:'DetectedFluorophore',type:'Text'},
      {id:'StockMarker',type:'Bool'},{id:'DateLabel',type:'Text'},
      {id:'RawTable',type:'Text'},{id:'RawCell',type:'Text'}
    ],
    InventoryPositions:[
      {id:'Code',type:'Text'},{id:'InventoryType',type:'Text'},{id:'Container',type:'Ref:InventoryContainers'},
      {id:'Slot',type:'Text'},{id:'Unit',type:'Ref:InventoryUnits'},{id:'Available',type:'Bool'},{id:'Notes',type:'Text'}
    ],
    InventoryDocuments:[
      {id:'Item',type:'Ref:InventoryItems'},{id:'InventoryType',type:'Text'},{id:'Title',type:'Text'},{id:'Type',type:'Text'},
      {id:'Link',type:'Text'},{id:'Notes',type:'Text'}
    ],
    InventoryNotes:[
      {id:'Item',type:'Ref:InventoryItems'},{id:'InventoryType',type:'Text'},{id:'Date',type:'DateTime'},
      {id:'Author',type:'Text'},{id:'Text',type:'Text'},{id:'AttachmentLink',type:'Text'}
    ],
    InventoryHistory:[
      {id:'Date',type:'DateTime'},{id:'InventoryType',type:'Text'},{id:'Action',type:'Text'},{id:'EntityType',type:'Text'},
      {id:'EntityCode',type:'Text'},{id:'Details',type:'Text'},{id:'User',type:'Text'}
    ],
    EnrichmentQueue:[
      {id:'TargetTable',type:'Text'},{id:'TargetId',type:'Int'},{id:'TargetCode',type:'Text'},{id:'InventoryType',type:'Text'},
      {id:'Kind',type:'Text'},{id:'Title',type:'Text'},{id:'Link',type:'Text'},{id:'Confidence',type:'Numeric'},
      {id:'Status',type:'Text'},{id:'Reason',type:'Text'},{id:'CreatedAt',type:'DateTime'},{id:'PayloadJSON',type:'Text'}
    ]
  };

  const CREATE_ORDER=[
    'InventoryTypes','FieldDefinitions','ChoiceOptions','SupplierConfig','Synonyms','FeatureFlags',
    'AutomationRules','AlertRules','WatchProfiles','WatchTerms','WatchScoring','ImportProfiles','ConfigVersions',
    'InventoryItems','InventoryAttributes','InventoryContainers','InventoryUnits','InventoryPositions',
    'InventoryDocuments','InventoryNotes','InventoryHistory','EnrichmentQueue'
  ];

  const CONFIG_TABLES=new Set([
    'InventoryTypes','FieldDefinitions','ChoiceOptions','SupplierConfig','Synonyms','FeatureFlags',
    'AutomationRules','AlertRules','WatchProfiles','WatchTerms','WatchScoring','ImportProfiles','ConfigVersions'
  ]);

  const DEFAULTS={
    InventoryTypes:[
      {Key:'primary_antibody',Name:'Anticorps primaires',SingularName:'Anticorps primaire',Icon:'Y',Mode:'legacy',Enabled:true,StorageEnabled:true,TemperatureHint:'-20°C / +4°C',UnitLabel:'Vial',SortOrder:10,Notes:'BDD historique conservée sans migration.'},
      {Key:'secondary_antibody',Name:'Anticorps secondaires',SingularName:'Anticorps secondaire',Icon:'S',Mode:'generic',Enabled:true,StorageEnabled:true,TemperatureHint:'-20°C / +4°C',UnitLabel:'Vial',SortOrder:20,Notes:'Inventaire générique alimenté par le fichier BDMIT secondary antibodies 2025.xlsx.'},
      {Key:'cell_stock',Name:'Cellules',SingularName:'Stock cellulaire',Icon:'C',Mode:'generic',Enabled:false,StorageEnabled:true,TemperatureHint:'-80°C',UnitLabel:'Cryovial',SortOrder:30,Notes:'Structure préparée. La rubrique apparaît automatiquement après activation/import des données cellules.'}
    ],
    FeatureFlags:[
      {Key:'config_driven_nav',Enabled:true,Value:'',Scope:'app',Description:'Affiche automatiquement les inventaires activés dans InventoryTypes.'},
      {Key:'secondary_inventory',Enabled:true,Value:'',Scope:'secondary_antibody',Description:'Active l’inventaire des anticorps secondaires.'},
      {Key:'cell_inventory',Enabled:false,Value:'',Scope:'cell_stock',Description:'Prépare la rubrique cellules -80 °C, masquée tant que les données ne sont pas prêtes.'},
      {Key:'duplicate_detection',Enabled:true,Value:'50',Scope:'app',Description:'Détecte les doublons probables avant import/création.'},
      {Key:'smart_placement',Enabled:true,Value:'cluster',Scope:'storage',Description:'Propose une position libre proche des vials du même item.'},
      {Key:'auto_enrichment_on_create',Enabled:true,Value:'suggestions',Scope:'primary_antibody',Description:'Lance l’enrichissement après création d’un anticorps et place les résultats dans EnrichmentQueue.'},
      {Key:'auto_add_official_datasheet',Enabled:false,Value:'',Scope:'documents',Description:'Si activé, permet l’ajout automatique d’une datasheet uniquement quand la correspondance officielle est certaine.'},
      {Key:'scientific_watch',Enabled:true,Value:'primary_mito',Scope:'journal',Description:'Active la veille scientifique configurable.'},
      {Key:'integrity_checks',Enabled:true,Value:'',Scope:'app',Description:'Calcule les incohérences de stockage et les éléments orphelins.'}
    ],
    ChoiceOptions:[
      {GroupKey:'fill_status',Value:'Plein',Label:'Plein',SortOrder:10,Active:true},
      {GroupKey:'fill_status',Value:'≈ 50 %',Label:'≈ 50 %',SortOrder:20,Active:true},
      {GroupKey:'fill_status',Value:'Vide',Label:'Vide',SortOrder:30,Active:true},
      {GroupKey:'fill_status',Value:'Inconnu',Label:'Inconnu',SortOrder:40,Active:true},
      {GroupKey:'unit_status',Value:'En stock',Label:'En stock',SortOrder:10,Active:true},
      {GroupKey:'unit_status',Value:'À ranger',Label:'À ranger',SortOrder:20,Active:true},
      {GroupKey:'unit_status',Value:'À réconcilier',Label:'À réconcilier',SortOrder:30,Active:true},
      {GroupKey:'unit_status',Value:'Vide / à retirer',Label:'Vide / à retirer',SortOrder:40,Active:true},
      {GroupKey:'unit_status',Value:'Archivé',Label:'Archivé',SortOrder:50,Active:true},
      {GroupKey:'mycoplasma_status',Value:'Négatif',Label:'Négatif',SortOrder:10,Active:true},
      {GroupKey:'mycoplasma_status',Value:'À tester',Label:'À tester',SortOrder:20,Active:true},
      {GroupKey:'mycoplasma_status',Value:'Positif',Label:'Positif',SortOrder:30,Active:true},
      {GroupKey:'mycoplasma_status',Value:'Inconnu',Label:'Inconnu',SortOrder:40,Active:true}
    ],
    SupplierConfig:[
      {Name:'ThermoFisher',CanonicalName:'Thermo Fisher Scientific',Domains:'thermofisher.com',Aliases:'ThermoFisher|Thermo Fisher|Invitrogen',SearchTemplate:'',Active:true,Notes:'Configuration initiale issue du stock de secondaires.'},
      {Name:'Cytiva',CanonicalName:'Cytiva',Domains:'cytivalifesciences.com',Aliases:'Cytiva|Cityva',SearchTemplate:'',Active:true,Notes:'« Cityva » est conservé comme alias de recherche, sans réécriture automatique de la source.'},
      {Name:'Biotium',CanonicalName:'Biotium',Domains:'biotium.com',Aliases:'Biotium',SearchTemplate:'',Active:true,Notes:''}
    ],
    Synonyms:[
      {Scope:'supplier',Canonical:'Cytiva',Alias:'Cityva',Active:true,Notes:'Alias utilisé pour la recherche/matching ; ne modifie pas la valeur source.'},
      {Scope:'fluorophore',Canonical:'AF488',Alias:'AF 488',Active:true,Notes:''},
      {Scope:'fluorophore',Canonical:'AF555',Alias:'AF 555',Active:true,Notes:''},
      {Scope:'fluorophore',Canonical:'DyLight 649',Alias:'D649',Active:true,Notes:''},
      {Scope:'fluorophore',Canonical:'CyDye 800',Alias:'Cydye 800',Active:true,Notes:''}
    ],
    AlertRules:[
      {Key:'low_volume',Name:'Volume faible',EntityType:'unit',Field:'EstimatedVolume_uL',Operator:'lt',CompareValue:'30',Severity:'warning',Message:'{Code} : volume estimé inférieur à 30 µL.',Priority:10,Enabled:true},
      {Key:'to_store',Name:'Vial à ranger',EntityType:'unit',Field:'Status',Operator:'equals',CompareValue:'À ranger',Severity:'warning',Message:'{Code} doit être rangé.',Priority:20,Enabled:true},
      {Key:'needs_reconciliation',Name:'Réconciliation nécessaire',EntityType:'unit',Field:'Status',Operator:'equals',CompareValue:'À réconcilier',Severity:'warning',Message:'{Code} doit être relié à une référence validée.',Priority:30,Enabled:true},
      {Key:'empty_remove',Name:'Vial vide à retirer',EntityType:'unit',Field:'Status',Operator:'equals',CompareValue:'Vide / à retirer',Severity:'info',Message:'{Code} est vide mais occupe encore sa position.',Priority:40,Enabled:true}
    ],
    AutomationRules:[
      {Key:'history_on_move',Name:'Tracer les déplacements',Event:'unit_moved',EntityType:'unit',Field:'',Operator:'equals',CompareValue:'',Action:'history',ActionValue:'Déplacement',Priority:10,Enabled:true,Description:'Ajoute automatiquement une ligne d’historique lors d’un déplacement.'},
      {Key:'enrich_new_primary',Name:'Enrichir un nouvel anticorps',Event:'item_created',EntityType:'primary_antibody',Field:'',Operator:'equals',CompareValue:'',Action:'enrichment',ActionValue:'primary_mito',Priority:20,Enabled:true,Description:'Recherche datasheet/publications après ajout.'}
    ],
    WatchProfiles:[
      {Key:'primary_mito',Name:'Anticorps primaires — mitochondries',Enabled:true,CurrentYearOnly:true,ArchiveYears:2,MaxResults:25,RefreshDays:1,Notes:'Profil par défaut de la veille. L’année courante est prioritaire.'}
    ],
    WatchTerms:[
      {ProfileKey:'primary_mito',Kind:'context',Term:'mitochondria',Weight:2,Active:true},
      {ProfileKey:'primary_mito',Kind:'context',Term:'mitochondrial',Weight:2,Active:true},
      {ProfileKey:'primary_mito',Kind:'context',Term:'mitofusin',Weight:2,Active:true},
      {ProfileKey:'primary_mito',Kind:'context',Term:'cristae',Weight:2,Active:true},
      {ProfileKey:'primary_mito',Kind:'context',Term:'mtDNA',Weight:2,Active:true},
      {ProfileKey:'primary_mito',Kind:'context',Term:'mitochondrial dynamics',Weight:2,Active:true},
      {ProfileKey:'primary_mito',Kind:'context',Term:'oxidative phosphorylation',Weight:2,Active:true}
    ],
    WatchScoring:[
      {ProfileKey:'primary_mito',Factor:'exact_reference',Weight:5,Active:true,Notes:'Référence catalogue exacte.'},
      {ProfileKey:'primary_mito',Factor:'same_target',Weight:3,Active:true,Notes:'Même cible/protéine.'},
      {ProfileKey:'primary_mito',Factor:'mitochondrial_context',Weight:2,Active:true,Notes:'Contexte mitochondrial.'},
      {ProfileKey:'primary_mito',Factor:'multiple_matches',Weight:1,Active:true,Notes:'Plusieurs éléments du stock reliés.'},
      {ProfileKey:'primary_mito',Factor:'method_signal',Weight:1,Active:true,Notes:'Alternative méthodologique détectée.'}
    ],
    FieldDefinitions:[
      {InventoryType:'secondary_antibody',FieldKey:'targetSpecies',Label:'Espèce cible',DataType:'text',Required:true,Visible:true,Searchable:true,Section:'Identification',SortOrder:10,StorageMode:'column',ColumnName:'TargetSpecies',ChoiceGroup:'',HelpText:'Espèce reconnue par le secondaire.',Active:true},
      {InventoryType:'secondary_antibody',FieldKey:'fluorophore',Label:'Fluorophore',DataType:'text',Required:true,Visible:true,Searchable:true,Section:'Fluorescence',SortOrder:20,StorageMode:'column',ColumnName:'Fluorophore',ChoiceGroup:'',HelpText:'Ex. AF488, AF647, Cy5.',Active:true},
      {InventoryType:'secondary_antibody',FieldKey:'excitation_nm',Label:'Excitation (nm)',DataType:'number',Required:false,Visible:true,Searchable:false,Section:'Fluorescence',SortOrder:30,StorageMode:'column',ColumnName:'Excitation_nm',ChoiceGroup:'',HelpText:'Pic/valeur d’excitation indiquée dans la source.',Active:true},
      {InventoryType:'secondary_antibody',FieldKey:'emission_nm',Label:'Émission (nm)',DataType:'number',Required:false,Visible:true,Searchable:false,Section:'Fluorescence',SortOrder:40,StorageMode:'column',ColumnName:'Emission_nm',ChoiceGroup:'',HelpText:'Pic/valeur d’émission indiquée dans la source.',Active:true},
      {InventoryType:'secondary_antibody',FieldKey:'hostSpecies',Label:'Espèce hôte',DataType:'text',Required:true,Visible:true,Searchable:true,Section:'Identification',SortOrder:50,StorageMode:'column',ColumnName:'HostSpecies',ChoiceGroup:'',HelpText:'Espèce dans laquelle le secondaire a été produit.',Active:true},
      {InventoryType:'secondary_antibody',FieldKey:'class',Label:'Classe',DataType:'text',Required:false,Visible:true,Searchable:true,Section:'Identification',SortOrder:60,StorageMode:'column',ColumnName:'Class',ChoiceGroup:'',HelpText:'Ex. polyclonal.',Active:true},
      {InventoryType:'secondary_antibody',FieldKey:'labWB',Label:'Validation labo — WB',DataType:'text',Required:false,Visible:true,Searchable:true,Section:'Validation labo',SortOrder:70,StorageMode:'attribute',ColumnName:'',ChoiceGroup:'',HelpText:'Dilution/validation Western Blot.',Active:true},
      {InventoryType:'secondary_antibody',FieldKey:'labImmunostaining',Label:'Validation labo — immunostaining',DataType:'text',Required:false,Visible:true,Searchable:true,Section:'Validation labo',SortOrder:80,StorageMode:'attribute',ColumnName:'',ChoiceGroup:'',HelpText:'Dilution/validation ICC/IHC/IF.',Active:true},
      {InventoryType:'secondary_antibody',FieldKey:'infos',Label:'Informations',DataType:'text',Required:false,Visible:true,Searchable:true,Section:'Notes',SortOrder:90,StorageMode:'attribute',ColumnName:'',ChoiceGroup:'',HelpText:'Informations de la liste source.',Active:true},

      {InventoryType:'cell_stock',FieldKey:'cellLine',Label:'Lignée',DataType:'text',Required:true,Visible:true,Searchable:true,Section:'Identité',SortOrder:10,StorageMode:'attribute',ColumnName:'',ChoiceGroup:'',HelpText:'Nom de la lignée cellulaire.',Active:true},
      {InventoryType:'cell_stock',FieldKey:'genotype',Label:'Génotype',DataType:'text',Required:false,Visible:true,Searchable:true,Section:'Identité',SortOrder:20,StorageMode:'attribute',ColumnName:'',ChoiceGroup:'',HelpText:'WT, KO, variant, etc.',Active:true},
      {InventoryType:'cell_stock',FieldKey:'clone',Label:'Clone',DataType:'text',Required:false,Visible:true,Searchable:true,Section:'Identité',SortOrder:30,StorageMode:'attribute',ColumnName:'',ChoiceGroup:'',HelpText:'Clone ou sous-clone.',Active:true},
      {InventoryType:'cell_stock',FieldKey:'passage',Label:'Passage',DataType:'number',Required:false,Visible:true,Searchable:false,Section:'Culture',SortOrder:40,StorageMode:'attribute',ColumnName:'',ChoiceGroup:'',HelpText:'Passage au moment de la congélation.',Active:true},
      {InventoryType:'cell_stock',FieldKey:'freezingDate',Label:'Date de congélation',DataType:'date',Required:false,Visible:true,Searchable:false,Section:'Cryoconservation',SortOrder:50,StorageMode:'attribute',ColumnName:'',ChoiceGroup:'',HelpText:'Date de mise au -80 °C / cryostock.',Active:true},
      {InventoryType:'cell_stock',FieldKey:'freezingMedium',Label:'Milieu de congélation',DataType:'text',Required:false,Visible:true,Searchable:true,Section:'Cryoconservation',SortOrder:60,StorageMode:'attribute',ColumnName:'',ChoiceGroup:'',HelpText:'Composition ou nom du milieu.',Active:true},
      {InventoryType:'cell_stock',FieldKey:'mycoplasmaStatus',Label:'Mycoplasmes',DataType:'choice',Required:false,Visible:true,Searchable:true,Section:'Contrôle qualité',SortOrder:70,StorageMode:'attribute',ColumnName:'',ChoiceGroup:'mycoplasma_status',HelpText:'Statut du dernier contrôle.',Active:true},
      {InventoryType:'cell_stock',FieldKey:'ownerTeam',Label:'Utilisateur / équipe',DataType:'text',Required:false,Visible:true,Searchable:true,Section:'Traçabilité',SortOrder:80,StorageMode:'attribute',ColumnName:'',ChoiceGroup:'',HelpText:'Responsable ou équipe.',Active:true}
    ],
    ImportProfiles:[
      {Key:'secondary_2025',Name:'BDMIT secondary antibodies 2025',InventoryType:'secondary_antibody',SourceSheetPattern:'list of all antibodies|-20C antibodies storage|4C antibodies storage',HeaderRow:2,MappingJSON:'{"Target species":"TargetSpecies","Fluorophore":"Fluorophore","Host species":"HostSpecies","Company":"Supplier","Catalog number":"CatalogNumber","Storage":"StorageTemperature","Website":"Website"}',MatchKeys:'CatalogNumber|Supplier|TargetSpecies|Fluorophore|StorageTemperature',StorageProfile:'secondary_boxes_10x10',Enabled:true,Notes:'Profil initial construit à partir du fichier reçu le 16/09/2026.'}
    ]
  };

  const EDIT_SPECS={
    InventoryTypes:[
      ['Key','Clé','text'],['Name','Nom','text'],['SingularName','Nom singulier','text'],['Icon','Icône','text'],
      ['Mode','Mode (legacy/generic)','text'],['Enabled','Activé','bool'],['StorageEnabled','Stockage','bool'],
      ['TemperatureHint','Température indicative','text'],['UnitLabel','Nom des unités','text'],['SortOrder','Ordre','number'],['Notes','Notes','textarea']
    ],
    FieldDefinitions:[
      ['InventoryType','Type inventaire','text'],['FieldKey','Clé du champ','text'],['Label','Libellé','text'],['DataType','Type','text'],
      ['Required','Obligatoire','bool'],['Visible','Visible','bool'],['Searchable','Recherchable','bool'],['Section','Section','text'],
      ['SortOrder','Ordre','number'],['StorageMode','Stockage (column/attribute)','text'],['ColumnName','Colonne','text'],
      ['ChoiceGroup','Groupe de choix','text'],['HelpText','Aide','textarea'],['Active','Actif','bool']
    ],
    ChoiceOptions:[
      ['GroupKey','Groupe','text'],['Value','Valeur','text'],['Label','Libellé','text'],['SortOrder','Ordre','number'],['Active','Actif','bool']
    ],
    SupplierConfig:[
      ['Name','Nom','text'],['CanonicalName','Nom canonique','text'],['Domains','Domaines (|)','text'],['Aliases','Alias (|)','text'],
      ['SearchTemplate','Modèle de recherche','text'],['Active','Actif','bool'],['Notes','Notes','textarea']
    ],
    Synonyms:[
      ['Scope','Portée','text'],['Canonical','Valeur canonique','text'],['Alias','Alias','text'],['Active','Actif','bool'],['Notes','Notes','textarea']
    ],
    FeatureFlags:[
      ['Key','Clé','text'],['Enabled','Activé','bool'],['Value','Valeur','text'],['Scope','Portée','text'],['Description','Description','textarea']
    ],
    AutomationRules:[
      ['Key','Clé','text'],['Name','Nom','text'],['Event','Événement','text'],['EntityType','Type entité','text'],['Field','Champ','text'],
      ['Operator','Opérateur','text'],['CompareValue','Valeur','text'],['Action','Action','text'],['ActionValue','Valeur action','text'],
      ['Priority','Priorité','number'],['Enabled','Activée','bool'],['Description','Description','textarea']
    ],
    AlertRules:[
      ['Key','Clé','text'],['Name','Nom','text'],['EntityType','Type entité','text'],['Field','Champ','text'],['Operator','Opérateur','text'],
      ['CompareValue','Valeur','text'],['Severity','Sévérité','text'],['Message','Message','textarea'],['Priority','Priorité','number'],['Enabled','Activée','bool']
    ],
    WatchProfiles:[
      ['Key','Clé','text'],['Name','Nom','text'],['Enabled','Activé','bool'],['CurrentYearOnly','Année courante uniquement','bool'],
      ['ArchiveYears','Années d’archive','number'],['MaxResults','Résultats max','number'],['RefreshDays','Rafraîchissement (jours)','number'],['Notes','Notes','textarea']
    ],
    WatchTerms:[
      ['ProfileKey','Profil','text'],['Kind','Type terme','text'],['Term','Terme','text'],['Weight','Poids','number'],['Active','Actif','bool']
    ],
    WatchScoring:[
      ['ProfileKey','Profil','text'],['Factor','Facteur','text'],['Weight','Poids','number'],['Active','Actif','bool'],['Notes','Notes','textarea']
    ],
    ImportProfiles:[
      ['Key','Clé','text'],['Name','Nom','text'],['InventoryType','Type inventaire','text'],['SourceSheetPattern','Feuilles','text'],
      ['HeaderRow','Ligne entête','number'],['MappingJSON','Mapping JSON','textarea'],['MatchKeys','Clés rapprochement','text'],
      ['StorageProfile','Profil stockage','text'],['Enabled','Activé','bool'],['Notes','Notes','textarea']
    ]
  };

  function hasTable(name){ return (state.tables||[]).includes(name); }
  function tableRows(name){ return rows(state.data[name]||ns.data[name]); }
  function esc12(v){ return esc(v); }

  async function refreshTables(){
    if(!state.connected) return;
    const current=await grist.docApi.listTables();
    state.tables=current;
    const present=CREATE_ORDER.filter(t=>current.includes(t));
    const result=await Promise.all(present.map(async t=>[t,await grist.docApi.fetchTable(t)]));
    for(const [t,data] of result){ ns.data[t]=data; state.data[t]=data; }
    ns.ready=CONFIG_TABLES.size>0 && [...CONFIG_TABLES].every(t=>current.includes(t));
  }
  ns.refreshTables=refreshTables;

  async function ensureSchema(){
    if(!state.connected) return toast('Connexion Grist requise pour initialiser v11.2.');
    const current=new Set(await grist.docApi.listTables());
    const created=[];
    const completed=[];
    for(const table of CREATE_ORDER){
      if(!current.has(table)){
        await grist.docApi.applyUserActions([['AddTable',table,SCHEMAS[table].map(c=>({...c,isFormula:false}))]]);
        current.add(table); created.push(table);
        continue;
      }
      // v11.2 schema upgrades are additive: add only missing columns, never remove/rename user data.
      const raw=await grist.docApi.fetchTable(table);
      const cols=new Set(Array.isArray(raw)?Object.keys(raw[0]||{}):Object.keys(raw||{}));
      const missingCols=SCHEMAS[table].filter(c=>!cols.has(c.id));
      if(missingCols.length){
        await grist.docApi.applyUserActions(missingCols.map(c=>['AddColumn',table,c.id,{type:c.type,isFormula:false}]));
        completed.push(`${table} (+${missingCols.length})`);
      }
    }
    await refreshTables();
    await seedDefaults();
    await refreshTables();
    await saveConfigVersion(`Initialisation v11.2 — ${created.length} table(s) créée(s), ${completed.length} table(s) complétée(s)`);
    toast(created.length||completed.length?`${created.length} table(s) créée(s), ${completed.length} table(s) complétée(s).`:'Structure v11.2 déjà complète.');
    admin();
  }
  ns.ensureSchema=ensureSchema;

  async function seedDefaults(){
    if(!state.connected) return;
    for(const [table,recs] of Object.entries(DEFAULTS)){
      if(!hasTable(table) || tableRows(table).length) continue;
      if(!recs.length) continue;
      const cols=Object.keys(recs[0]);
      const vals=Object.fromEntries(cols.map(c=>[c,recs.map(r=>r[c]??null)]));
      await grist.docApi.applyUserActions([['BulkAddRecord',table,Array(recs.length).fill(null),vals]]);
      const fresh=await grist.docApi.fetchTable(table); ns.data[table]=fresh; state.data[table]=fresh;
    }
  }

  function configSnapshot(){
    const out={version:ns.version,createdAt:new Date().toISOString(),tables:{}};
    for(const t of CONFIG_TABLES) out.tables[t]=tableRows(t).map(r=>{
      const x={...r}; delete x.id; return x;
    });
    return out;
  }
  ns.configSnapshot=configSnapshot;

  async function saveConfigVersion(summary='Snapshot manuel'){
    if(!state.connected || !hasTable('ConfigVersions')) return;
    const snap=JSON.stringify(configSnapshot());
    await grist.docApi.applyUserActions([['AddRecord','ConfigVersions',null,{
      Date:Date.now()/1000,Version:ns.version,User:'Grist',Summary:summary,SnapshotJSON:snap
    }]]);
    const fresh=await grist.docApi.fetchTable('ConfigVersions'); ns.data.ConfigVersions=fresh; state.data.ConfigVersions=fresh;
  }
  ns.saveConfigVersion=saveConfigVersion;

  function exportConfig(){
    const blob=new Blob([JSON.stringify(configSnapshot(),null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=`BioDynaMit-config-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),500);
  }

  function featureEnabled(key,fallback=false){
    const r=tableRows('FeatureFlags').find(x=>String(x.Key)===String(key));
    return r ? r.Enabled===true : fallback;
  }
  ns.featureEnabled=featureEnabled;

  function inventoryTypes(){
    const configured=tableRows('InventoryTypes');
    if(configured.length) return configured.slice().sort((a,b)=>Number(a.SortOrder||0)-Number(b.SortOrder||0));
    return DEFAULTS.InventoryTypes;
  }
  ns.inventoryTypes=inventoryTypes;

  function fieldsFor(type){
    const configured=tableRows('FieldDefinitions').filter(x=>x.InventoryType===type && x.Active!==false);
    return configured.slice().sort((a,b)=>Number(a.SortOrder||0)-Number(b.SortOrder||0));
  }
  ns.fieldsFor=fieldsFor;

  function choiceValues(group){
    return tableRows('ChoiceOptions').filter(x=>x.GroupKey===group && x.Active!==false)
      .sort((a,b)=>Number(a.SortOrder||0)-Number(b.SortOrder||0));
  }
  ns.choiceValues=choiceValues;

  function applySynonym(scope,value){
    const n=core.normalizeText(value);
    const hit=tableRows('Synonyms').find(x=>x.Active!==false && core.normalizeText(x.Scope)===core.normalizeText(scope) && core.normalizeText(x.Alias)===n);
    return hit?.Canonical || value;
  }
  ns.applySynonym=applySynonym;

  function activeWatchProfile(key='primary_mito'){
    return tableRows('WatchProfiles').find(x=>x.Key===key && x.Enabled!==false) || DEFAULTS.WatchProfiles.find(x=>x.Key===key);
  }
  ns.activeWatchProfile=activeWatchProfile;
  ns.watchTerms=(key='primary_mito')=>{
    const r=tableRows('WatchTerms').filter(x=>x.ProfileKey===key&&x.Active!==false);
    return r.length?r:DEFAULTS.WatchTerms.filter(x=>x.ProfileKey===key&&x.Active!==false);
  };
  ns.watchScoring=(key='primary_mito')=>{
    const r=tableRows('WatchScoring').filter(x=>x.ProfileKey===key&&x.Active!==false);
    return r.length?r:DEFAULTS.WatchScoring.filter(x=>x.ProfileKey===key&&x.Active!==false);
  };

  async function writeRecord(table,record,id=null){
    if(!state.connected) return toast('Connexion Grist requise.');
    const action=id?['UpdateRecord',table,Number(id),record]:['AddRecord',table,null,record];
    await grist.docApi.applyUserActions([action]);
    const fresh=await grist.docApi.fetchTable(table); ns.data[table]=fresh; state.data[table]=fresh;
  }
  ns.writeRecord=writeRecord;

  function formValue(id,type){
    const el=document.getElementById(id);
    if(!el) return null;
    if(type==='bool') return !!el.checked;
    if(type==='number') return el.value===''?null:Number(el.value);
    return el.value.trim();
  }

  function showConfigEditor(table,record=null){
    const spec=EDIT_SPECS[table];
    if(!spec) return;
    const uid='v112Edit';
    modal(`<h2>${record?'Modifier':'Ajouter'} — ${esc12(table)}</h2>
      <div class="v112-form-grid">
        ${spec.map(([key,label,type])=>{
          const val=record?.[key]??'';
          if(type==='bool') return `<label class="v112-check"><input id="${uid}${key}" type="checkbox" ${val===true?'checked':''}><span>${esc12(label)}</span></label>`;
          if(type==='textarea') return `<div class="field v112-span2"><label>${esc12(label)}</label><textarea id="${uid}${key}" rows="4">${esc12(val)}</textarea></div>`;
          return `<div class="field"><label>${esc12(label)}</label><input id="${uid}${key}" type="${type==='number'?'number':'text'}" value="${esc12(val)}"></div>`;
        }).join('')}
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="btn" id="v112EditCancel">Annuler</button>
        <button class="btn btn-primary" id="v112EditSave">Enregistrer</button>
      </div>`);
    $('#v112EditCancel').onclick=closeModal;
    $('#v112EditSave').onclick=async()=>{
      const rec={};
      for(const [key,,type] of spec) rec[key]=formValue(uid+key,type);
      try{
        await writeRecord(table,rec,record?.id);
        closeModal(); toast('Configuration enregistrée.'); admin();
      }catch(err){ console.error(err); toast(`Erreur : ${err.message||err}`); }
    };
  }

  function genericConfigTable(table,columns){
    if(!hasTable(table)) return `<div class="empty">Table ${esc12(table)} non initialisée.</div>`;
    const data=tableRows(table);
    return `<div class="row space-between" style="margin-bottom:10px">
      <span class="subtitle">${data.length} entrée(s)</span><button class="btn btn-primary btn-sm" data-v112-add="${esc12(table)}">+ Ajouter</button>
    </div>
    <div class="table-wrap"><table class="table v112-table"><thead><tr>${columns.map(c=>`<th>${esc12(c.label)}</th>`).join('')}<th></th></tr></thead>
    <tbody>${data.map(r=>`<tr>${columns.map(c=>`<td>${c.render?c.render(r):esc12(r[c.key]??'')}</td>`).join('')}<td><button class="btn btn-sm" data-v112-edit="${esc12(table)}" data-id="${r.id}">Modifier</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function bindConfigEditors(root=document){
    root.querySelectorAll('[data-v112-add]').forEach(b=>b.onclick=()=>showConfigEditor(b.dataset.v112Add));
    root.querySelectorAll('[data-v112-edit]').forEach(b=>{
      b.onclick=()=>{
        const table=b.dataset.v112Edit, record=tableRows(table).find(x=>Number(x.id)===Number(b.dataset.id));
        showConfigEditor(table,record);
      };
    });
  }

  function integrityReport(){
    const primary=core.checkStorageIntegrity({
      containers:rows(state.data.Boxes).map(x=>({...x,code:String(x.id)})),
      units:rows(state.data.Vials).map(x=>({...x,code:String(x.id)})),
      positions:rows(state.data.Positions).map(x=>({containerCode:String(x.Box||''),slot:x.Slot,unitCode:x.Vial?String(x.Vial):'',available:x.Available}))
    });
    const generic=core.checkStorageIntegrity({
      containers:tableRows('InventoryContainers').map(x=>({...x,code:String(x.id)})),
      units:tableRows('InventoryUnits').map(x=>({...x,code:String(x.id)})),
      positions:tableRows('InventoryPositions').map(x=>({containerCode:String(x.Container||''),slot:x.Slot,unitCode:x.Unit?String(x.Unit):'',available:x.Available}))
    });

    const dup=[];
    const abs=rows(state.data.Antibodies);
    for(let i=0;i<abs.length;i++) for(let j=i+1;j<abs.length;j++){
      const d=core.duplicateScore(abs[i],abs[j]);
      if(d.score>=50) dup.push({a:abs[i],b:abs[j],...d,scope:'primary'});
    }
    const items=tableRows('InventoryItems');
    for(let i=0;i<items.length;i++) for(let j=i+1;j<items.length;j++){
      if(items[i].InventoryType!==items[j].InventoryType) continue;
      const d=core.duplicateScore(items[i],items[j]);
      if(d.score>=50) dup.push({a:items[i],b:items[j],...d,scope:items[i].InventoryType});
    }
    ns.lastIntegrity={primary,generic,duplicates:dup};
    return ns.lastIntegrity;
  }
  ns.integrityReport=integrityReport;

  function adminOverview(){
    const missing=CREATE_ORDER.filter(t=>!hasTable(t));
    const manifest=window.BioDynaMitSecondary2025;
    return `<div class="grid grid-4">
      <div class="card card-pad"><div class="metric-value">${esc12(ns.version)}</div><div class="subtitle">Moteur de configuration</div></div>
      <div class="card card-pad"><div class="metric-value">${CREATE_ORDER.length-missing.length}/${CREATE_ORDER.length}</div><div class="subtitle">Tables v11.2 présentes</div></div>
      <div class="card card-pad"><div class="metric-value">${manifest?.summary?.items??0}</div><div class="subtitle">Références secondaires détectées</div></div>
      <div class="card card-pad"><div class="metric-value">${manifest?.summary?.occupiedUnits??0}</div><div class="subtitle">Vials secondaires dans l’Excel</div></div>
    </div>
    <div class="card card-pad" style="margin-top:16px">
      <h3 class="section-title">Initialisation additive</h3>
      <p>La v11.2 ajoute sa couche de configuration et ses tables d’inventaires génériques. Elle ne relance ni la migration des anticorps primaires ni la migration du stockage historique.</p>
      ${missing.length?`<div class="banner">Tables manquantes : ${missing.map(esc12).join(', ')}</div>`:'<span class="pill ok">Structure v11.2 complète</span>'}
      <div class="row" style="margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-primary" id="v112Init">${missing.length?'Initialiser / compléter v11.2':'Vérifier la structure v11.2'}</button>
        <button class="btn" id="v112Reload">Recharger la configuration</button>
        <button class="btn" id="v112Snapshot" ${hasTable('ConfigVersions')?'':'disabled'}>Créer un snapshot</button>
        <button class="btn" id="v112Export">Exporter la configuration JSON</button>
      </div>
    </div>
    <div class="card card-pad" style="margin-top:16px">
      <h3 class="section-title">Principes de sécurité</h3>
      <div class="v112-bullets">
        <p>✓ Initialisation idempotente : seules les tables manquantes sont créées.</p>
        <p>✓ Les valeurs par défaut ne sont ajoutées que dans des tables de configuration vides.</p>
        <p>✓ Aucune donnée de test n’est injectée automatiquement.</p>
        <p>✓ Les anciennes migrations restent hors du parcours normal.</p>
        <p>✓ Les inventaires secondaires/cellules utilisent de nouvelles tables génériques et ne modifient pas les tables Antibodies/Vials/Boxes/Positions.</p>
      </div>
    </div>`;
  }

  function adminInventories(){
    return genericConfigTable('InventoryTypes',[
      {key:'Icon',label:''},{key:'Name',label:'Inventaire'},{key:'Mode',label:'Mode'},
      {key:'Enabled',label:'Actif',render:r=>r.Enabled?'<span class="pill ok">Oui</span>':'<span class="pill neutral">Non</span>'},
      {key:'StorageEnabled',label:'Stockage',render:r=>r.StorageEnabled?'Oui':'Non'},
      {key:'TemperatureHint',label:'Température'},{key:'Notes',label:'Notes'}
    ]);
  }

  function adminFields(){
    return genericConfigTable('FieldDefinitions',[
      {key:'InventoryType',label:'Inventaire'},{key:'Label',label:'Champ'},{key:'DataType',label:'Type'},
      {key:'Section',label:'Section'},{key:'StorageMode',label:'Stockage'},
      {key:'Visible',label:'Visible',render:r=>r.Visible?'Oui':'Non'},
      {key:'Active',label:'Actif',render:r=>r.Active?'Oui':'Non'}
    ]);
  }

  function adminSuppliers(){
    return `<div class="v112-stack">
      <div class="card card-pad"><h3 class="section-title">Fournisseurs</h3>${genericConfigTable('SupplierConfig',[
        {key:'CanonicalName',label:'Nom canonique'},{key:'Domains',label:'Domaines'},{key:'Aliases',label:'Alias'},
        {key:'Active',label:'Actif',render:r=>r.Active?'Oui':'Non'},{key:'Notes',label:'Notes'}
      ])}</div>
      <div class="card card-pad"><h3 class="section-title">Synonymes</h3>${genericConfigTable('Synonyms',[
        {key:'Scope',label:'Portée'},{key:'Alias',label:'Alias'},{key:'Canonical',label:'Canonique'},
        {key:'Active',label:'Actif',render:r=>r.Active?'Oui':'Non'},{key:'Notes',label:'Notes'}
      ])}</div>
    </div>`;
  }

  function adminRules(){
    return `<div class="v112-stack">
      <div class="card card-pad"><h3 class="section-title">Alertes configurables</h3>${genericConfigTable('AlertRules',[
        {key:'Name',label:'Règle'},{key:'EntityType',label:'Entité'},{key:'Field',label:'Champ'},{key:'Operator',label:'Opérateur'},
        {key:'CompareValue',label:'Valeur'},{key:'Severity',label:'Niveau'},{key:'Enabled',label:'Active',render:r=>r.Enabled?'Oui':'Non'}
      ])}</div>
      <div class="card card-pad"><h3 class="section-title">Automatisations</h3>${genericConfigTable('AutomationRules',[
        {key:'Name',label:'Règle'},{key:'Event',label:'Événement'},{key:'EntityType',label:'Entité'},{key:'Action',label:'Action'},
        {key:'Enabled',label:'Active',render:r=>r.Enabled?'Oui':'Non'},{key:'Description',label:'Description'}
      ])}</div>
      <div class="card card-pad"><h3 class="section-title">Feature flags</h3>${genericConfigTable('FeatureFlags',[
        {key:'Key',label:'Fonction'},{key:'Scope',label:'Portée'},{key:'Enabled',label:'Active',render:r=>r.Enabled?'<span class="pill ok">Oui</span>':'<span class="pill neutral">Non</span>'},
        {key:'Value',label:'Valeur'},{key:'Description',label:'Description'}
      ])}</div>
    </div>`;
  }

  function adminWatch(){
    return `<div class="v112-stack">
      <div class="card card-pad"><h3 class="section-title">Profils de veille</h3>${genericConfigTable('WatchProfiles',[
        {key:'Name',label:'Profil'},{key:'CurrentYearOnly',label:'Année courante',render:r=>r.CurrentYearOnly?'Oui':'Non'},
        {key:'ArchiveYears',label:'Archives (ans)'},{key:'MaxResults',label:'Max'},{key:'Enabled',label:'Actif',render:r=>r.Enabled?'Oui':'Non'}
      ])}</div>
      <div class="card card-pad"><h3 class="section-title">Termes de recherche</h3>${genericConfigTable('WatchTerms',[
        {key:'ProfileKey',label:'Profil'},{key:'Kind',label:'Type'},{key:'Term',label:'Terme'},{key:'Weight',label:'Poids'},
        {key:'Active',label:'Actif',render:r=>r.Active?'Oui':'Non'}
      ])}</div>
      <div class="card card-pad"><h3 class="section-title">Score de pertinence</h3>${genericConfigTable('WatchScoring',[
        {key:'ProfileKey',label:'Profil'},{key:'Factor',label:'Facteur'},{key:'Weight',label:'Poids'},
        {key:'Active',label:'Actif',render:r=>r.Active?'Oui':'Non'},{key:'Notes',label:'Notes'}
      ])}</div>
    </div>`;
  }

  function adminImports(){
    const m=window.BioDynaMitSecondary2025;
    return `<div class="card card-pad">
      <h3 class="section-title">Assistant d’import</h3>
      <p>Les profils décrivent les feuilles, champs et clés de rapprochement. Le code de l’application n’a pas besoin d’être modifié pour changer un mapping stocké dans Grist.</p>
      ${genericConfigTable('ImportProfiles',[
        {key:'Name',label:'Profil'},{key:'InventoryType',label:'Inventaire'},{key:'SourceSheetPattern',label:'Feuilles'},
        {key:'MatchKeys',label:'Clés de rapprochement'},{key:'Enabled',label:'Actif',render:r=>r.Enabled?'Oui':'Non'}
      ])}
    </div>
    ${m?`<div class="card card-pad" style="margin-top:16px">
      <h3 class="section-title">Fichier reçu — anticorps secondaires 2025</h3>
      <div class="grid grid-4">
        <div><b>${m.summary.items}</b><small> références</small></div>
        <div><b>${m.summary.occupiedUnits}</b><small> vials positionnés</small></div>
        <div><b>${m.summary.autoMatchedUnits}</b><small> correspondances sûres</small></div>
        <div><b>${m.summary.reviewUnits+m.summary.unresolvedUnits+m.summary.otherReagentUnits}</b><small> à vérifier</small></div>
      </div>
      <p class="subtitle" style="margin-top:10px">L’import réel est volontairement séparé de l’initialisation. Il sera proposé dans la rubrique Anticorps secondaires avec prévisualisation et réconciliation.</p>
    </div>`:''}`;
  }

  function adminIntegrity(){
    const rep=integrityReport();
    const issues=[...rep.primary.map(x=>({...x,scope:'Primaires'})),...rep.generic.map(x=>({...x,scope:'Inventaires génériques'}))];
    return `<div class="grid grid-3">
      <div class="card card-pad"><div class="metric-value">${rep.primary.length}</div><div class="subtitle">Incohérences stockage primaires</div></div>
      <div class="card card-pad"><div class="metric-value">${rep.generic.length}</div><div class="subtitle">Incohérences stockage générique</div></div>
      <div class="card card-pad"><div class="metric-value">${rep.duplicates.length}</div><div class="subtitle">Doublons probables ≥ 50 %</div></div>
    </div>
    <div class="card card-pad" style="margin-top:16px">
      <h3 class="section-title">Contrôle d’intégrité</h3>
      ${issues.length?`<table class="table"><thead><tr><th>Portée</th><th>Niveau</th><th>Type</th><th>Détail</th></tr></thead><tbody>
        ${issues.map(x=>`<tr><td>${esc12(x.scope)}</td><td>${esc12(x.severity)}</td><td>${esc12(x.kind)}</td><td>${esc12(x.message)}</td></tr>`).join('')}
      </tbody></table>`:'<div class="empty">Aucune incohérence structurelle détectée avec les données actuellement chargées.</div>'}
    </div>
    <div class="card card-pad" style="margin-top:16px">
      <h3 class="section-title">Doublons probables</h3>
      ${rep.duplicates.length?`<table class="table"><thead><tr><th>Portée</th><th>A</th><th>B</th><th>Score</th><th>Raisons</th></tr></thead><tbody>
        ${rep.duplicates.slice(0,100).map(d=>`<tr><td>${esc12(d.scope)}</td><td>${esc12(d.a.Name||d.a.Code)}</td><td>${esc12(d.b.Name||d.b.Code)}</td><td>${d.score}%</td><td>${esc12(d.reasons.join(', '))}</td></tr>`).join('')}
      </tbody></table>`:'<div class="empty">Aucun doublon probable au seuil actuel.</div>'}
    </div>`;
  }

  function adminVersions(){
    const versions=tableRows('ConfigVersions').slice().sort((a,b)=>Number(b.Date||0)-Number(a.Date||0));
    return `<div class="card card-pad">
      <div class="row space-between"><div><h3 class="section-title">Versions de configuration</h3><p class="subtitle">Snapshots des paramètres, distincts du code GitHub.</p></div>
      <div class="row"><button class="btn" id="v112VersionSave" ${hasTable('ConfigVersions')?'':'disabled'}>Créer un snapshot</button><button class="btn" id="v112VersionExport">Exporter JSON</button></div></div>
      ${versions.length?`<table class="table"><thead><tr><th>Date</th><th>Version</th><th>Résumé</th></tr></thead><tbody>${versions.slice(0,30).map(v=>`<tr><td>${v.Date?new Date(Number(v.Date)*1000).toLocaleString('fr-FR'):'—'}</td><td>${esc12(v.Version)}</td><td>${esc12(v.Summary)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucun snapshot enregistré.</div>'}
    </div>`;
  }

  function renderAdminBody(){
    switch(ns.adminTab){
      case 'inventories':return adminInventories();
      case 'fields':return adminFields();
      case 'suppliers':return adminSuppliers();
      case 'rules':return adminRules();
      case 'watch':return adminWatch();
      case 'imports':return adminImports();
      case 'integrity':return adminIntegrity();
      case 'versions':return adminVersions();
      default:return adminOverview();
    }
  }

  const baseAdmin=admin;
  admin=function(){
    topbar('Administration');
    content.innerHTML=`<h1 class="page-title">Administration v11.2</h1>
      <p class="subtitle">Paramètres de la BDD, règles, nouveaux inventaires et contrôles — sans modifier le code pour les évolutions courantes.</p>
      ${!state.connected?'<div class="banner error">Mode démonstration : les paramètres sont visibles mais aucune écriture Grist ne sera effectuée.</div>':''}
      <div class="v112-admin-tabs">
        ${[
          ['overview','Vue générale'],['inventories','Inventaires'],['fields','Champs'],['suppliers','Fournisseurs & synonymes'],
          ['rules','Règles & alertes'],['watch','Veille scientifique'],['imports','Imports'],['integrity','Intégrité'],['versions','Versions']
        ].map(([k,l])=>`<button class="tab ${ns.adminTab===k?'active':''}" data-v112-admin="${k}">${l}</button>`).join('')}
      </div>
      <div id="v112AdminBody">${renderAdminBody()}</div>
      <details class="card card-pad" style="margin-top:18px">
        <summary><b>Maintenance héritée</b> — migrations anciennes et données de test</summary>
        <p class="subtitle">La v11.2 ne lance jamais ces actions automatiquement. Si une opération historique est réellement nécessaire, utiliser une version de maintenance dédiée plutôt que le parcours normal.</p>
      </details>`;

    document.querySelectorAll('[data-v112-admin]').forEach(b=>b.onclick=()=>{ns.adminTab=b.dataset.v112Admin;admin();});
    bindConfigEditors(content);
    $('#v112Init')?.addEventListener('click',ensureSchema);
    $('#v112Reload')?.addEventListener('click',async()=>{await refreshTables();toast('Configuration rechargée.');admin();});
    $('#v112Snapshot')?.addEventListener('click',async()=>{await saveConfigVersion('Snapshot manuel');toast('Snapshot enregistré.');admin();});
    $('#v112Export')?.addEventListener('click',exportConfig);
    $('#v112VersionSave')?.addEventListener('click',async()=>{await saveConfigVersion('Snapshot manuel');toast('Snapshot enregistré.');admin();});
    $('#v112VersionExport')?.addEventListener('click',exportConfig);
  };
  ns.baseAdmin=baseAdmin;

  // Load v11.2 tables on every normal reload without changing app.js.
  const baseLoadAll=loadAll;
  loadAll=async function(){
    await baseLoadAll();
    try{ await refreshTables(); }catch(err){ console.warn('v11.2 config load:',err); }
  };

  // Initial opportunistic read. No schema write.
  setTimeout(async()=>{
    try{
      if(state.connected) await refreshTables();
      if(state.route==='admin') admin();
      else if(typeof renderNav==='function') renderNav();
    }catch(err){ console.warn('BioDynaMit v11.2 init:',err); }
  },50);
})();