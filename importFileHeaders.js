let fileHeaders = {
    transFile: ['Compound Group','Compound Name','ISTD?','Precursor Ion','MS1 Res',
                'Product Ion','MS2 Res','Dwell','Fragmentor','Optimized CE',
                'Cell Accelerator Voltage','Ion Name','Modifications'],
    peptideFile: ['Accession Number','Catalog_Number','Symbol','Peptide',
                  'Length (amino acid)','Type','Quality','Modification'],

    fullPeptideFile: ['Accession Number','Catalog Number','Protein Symbol', 'Peptide', 'Peptide Type', 'Peptide Quality', 'In Stock',
                      'Storage Location', 'Uniprot Accession', 'Gene Symbol', 'Species', 'Protein Name'],

    transEx: ["FF300447-41 (must be catalog number)","SFFPENWLWR (must be peptide)","TRUE","696.342164","Unit","1157.576609","Unit","10","380","19","4","y8","CAM|10"],
    peptideEx: ["XP_005257361;NP_000033","OR279078-11","APOH","VCPFAGILENGAVR","14","Heavy","Aqua","C2(CAM);R14(heavy)"]
}

module.exports.fileHeaders = fileHeaders;