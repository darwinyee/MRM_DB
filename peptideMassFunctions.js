let mw = {
    AA : {
        'A' : 71.03711,
        'R' : 156.10111,
        'N' : 114.04293,
        'D' : 115.02694,
        'C' : 103.00919,
        'E' : 129.04259,
        'Q' : 128.05858,
        'G' : 57.02146,
        'H' : 137.05891,
        'I' : 113.08406,
        'L' : 113.08406,
        'K' : 128.09496,
        'M' : 131.04049,
        'F' : 147.06841,
        'P' : 97.05276,
        'S' : 87.03203,
        'T' : 101.04768,
        'W' : 186.07931,
        'Y' : 163.06333,
        'V' : 99.06841
    },
    Chem : {
        'H2O' : 18.010565,
        'H+' : 1.007276
    }

}

let methods = {
    //Make query to database, can do multiple key,value pairs with either all AND or OR
    queryDB: function(criteria, table, shouldMatchAll){   //criteria is {column,value} pair, no checking if column exists
        //console.log(value);
        const pool = require('./dbcon.js').pool;
        let promise = new Promise((resolve, reject) => {
            //no error checking for incorrect column

            //build query string
            let linker = (shouldMatchAll)?' AND ':' OR ';
            let queryString = '';
            for(let item in criteria){
                queryString = queryString + item + '=\'' + criteria[item] + '\'' + linker;
            }
            if(queryString == ''){
                queryString = '1=1';
            }else{
                queryString = queryString.substr(0, queryString.length-4);
            }
            //console.log(queryString);
            

            //select query based on column
            pool.query('SELECT * FROM ' + table + ' WHERE ' + queryString, (err, result) => {
                if(err){
                    resolve({"error": "in queryDB: " + err});
                }else{
                    resolve({"queryResult":result});
                }
            });
        });
        return promise;
    },

    getMass : function(peptideSeq, modifications, peptideType, wholePeptideLength){
        //console.log(modifications);
        //peptideType is y or b ONLY
        //y: add aa mass then add H2O
        //b: add aa mass only
        let totalMass = (peptideType == 'y')?mw.Chem['H2O']:0.0;
        for(let i = 0; i < peptideSeq.length; i++){
            totalMass = totalMass + mw.AA[peptideSeq.charAt(i)];
        }

        //add modification mass
        let heavyMass = totalMass;
        let yOffset = (peptideType == 'y')?(wholePeptideLength - peptideSeq.length):0;

        for(let i = 0; i < modifications['modification'].length; i++){
            let adjPos = modifications['modification'][i].Position - yOffset;
            if(adjPos > 0 && adjPos <= peptideSeq.length){
                //console.log(modifications);
                //console.log(totalMass,heavyMass);
                if(modifications['modification'][i].ModificationType == 'heavy'){
                    heavyMass = heavyMass + Number(modifications['modification'][i].AddedMass);
                }else{
                    heavyMass = heavyMass + Number(modifications['modification'][i].AddedMass);
                    totalMass = totalMass + Number(modifications['modification'][i].AddedMass);
                }
                //console.log(totalMass,heavyMass);
            }
        }
        //console.log(totalMass,heavyMass);
        //return the answer: {lightMW:,heavyMW}
        return {lightMW:totalMass,heavyMW:heavyMass};

    },

    getMz : function(targetedMW, charge){
        let finalMW = targetedMW;
        for(let i = 0; i < charge; i++){
            finalMW = finalMW + mw.Chem['H+'];
        }
        return finalMW / charge;
    },

    getAllyb : function(peptideSeq, modifications, productMaxCharge){
        //this is to check if getMass and getMz function properly

        //{b+:{b1:{lightMW:,heavyMW:},b2,....},b++:{},y+:{y1:{lightMW:,heavyMW:},y2,...},y++:{}}

        let result = {};
        let curProductCharge = '';
        for(let productCharge = 1; productCharge <= productMaxCharge; productCharge++){
            curProductCharge = curProductCharge + '+';
            for(let i = 0; i < peptideSeq.length-1; i++){  //only from 1 to n-1 peptide length
                //b-ion
                let bIonName = 'b'+ (i + 1);
                let curBion = peptideSeq.substr(0,(i+1));
                let curBmass = methods.getMass(curBion,modifications,'b',peptideSeq.length);
                let curLightBmz = methods.getMz(curBmass.lightMW,productCharge);
                let curHeavyBmz = methods.getMz(curBmass.heavyMW,productCharge);
                let bIonChargeName = 'b' + curProductCharge;
                if(!result.hasOwnProperty(bIonChargeName)){
                    result[bIonChargeName] = {};
                }
                result[bIonChargeName][bIonName] = {lightMW:curLightBmz,heavyMW:curHeavyBmz};

                //y-ion
                let yIonName = 'y'+ (i+1);
                let curYion = peptideSeq.substr(peptideSeq.length-1-i,(i+1));
                let curYmass = methods.getMass(curYion, modifications, 'y',peptideSeq.length);
                let curLightYmz = methods.getMz(curYmass.lightMW,productCharge);
                let curHeavyYmz = methods.getMz(curYmass.heavyMW,productCharge);
                let yIonChargeName = 'y' + curProductCharge;
                if(!result.hasOwnProperty(yIonChargeName)){
                    result[yIonChargeName] = {};
                }
                result[yIonChargeName][yIonName] = {lightMW:curLightYmz,heavyMW:curHeavyYmz};
            }
        }
        return result;
    },

    getPrecursorLightMz : function(peptideSeq, modifications, heavyPrecursorMz){   //must be a heavy peptide
        //mass of peptide
        let peptideMass = methods.getMass(peptideSeq, modifications, 'y', peptideSeq.length);
        //get the charge
        let peptideCharge = Math.ceil(peptideMass.lightMW/heavyPrecursorMz);

        //return the lightMz
        return methods.getMz(peptideMass.lightMW, peptideCharge);

    },

    getPrecursorHeavyMz : function(peptideSeq, modifications, lightPrecursorMz){  //must be a heavy peptide
        //mass of peptide
        let peptideMass = methods.getMass(peptideSeq, modifications, 'y', peptideSeq.length);
        //get the charge
        let peptideCharge = Math.floor(peptideMass.heavyMW/lightPrecursorMz);

        //return the lightMz
        return methods.getMz(peptideMass.heavyMW, peptideCharge);

    },

    getTransLightMz : function(peptideSeq, modifications, productMaxCharge, heavyTransMz, ppm){
        let allyb = methods.getAllyb(peptideSeq, modifications, productMaxCharge);
        //console.log(allyb);
        let result = {};
        for(let transCharge in allyb){
            //console.log(transCharge);
            let thisChargeMatches = {};
            for(let transitions in allyb[transCharge]){
                //console.log(transitions);
                if(methods.isMatchedMz(heavyTransMz,allyb[transCharge][transitions].heavyMW, ppm)){
                    thisChargeMatches[transitions] = {lightMW:allyb[transCharge][transitions].lightMW,heavyMW:allyb[transCharge][transitions].heavyMW};
                }
            }
            if(Object.keys(thisChargeMatches).length != 0){
                result[transCharge] = thisChargeMatches;
            }
        }
        console.log(peptideSeq,heavyTransMz,ppm,result);
        return result;  //result is an object
    },

    getTransHeavyMz : function(peptideSeq, modifications, productMaxCharge, lightTransMz, ppm){
        let allyb = methods.getAllyb(peptideSeq, modifications, productMaxCharge);
        //console.log(allyb);
        let result = {};
        for(let transCharge in allyb){
            //console.log(transCharge);
            let thisChargeMatches = {};
            for(let transitions in allyb[transCharge]){
                //console.log(transitions);
                if(methods.isMatchedMz(lightTransMz,allyb[transCharge][transitions].lightMW, ppm)){
                    thisChargeMatches[transitions] = {lightMW:allyb[transCharge][transitions].lightMW,heavyMW:allyb[transCharge][transitions].heavyMW};
                }
            }
            if(Object.keys(thisChargeMatches).length != 0){
                result[transCharge] = thisChargeMatches;
            }
        }
        return result;  //result is an object
    },

    isMatchedMz : function(targetedMz, MzToMatch, maxPPM){
        targetedMz = Number(targetedMz);
        MzToMatch = Number(MzToMatch);
        let delta = MzToMatch * maxPPM / 1000000;
        let upperBound = MzToMatch + delta;
        let lowerBound = MzToMatch - delta;

        //console.log(upperBound,lowerBound,targetedMz,MzToMatch);
        if(targetedMz >= lowerBound && targetedMz <= upperBound){
            return true;
        }
        //console.log("not match!");
        //console.log(targetedMz, MzToMatch);
        return false;
    },

    //<-----------Extract Modification information from a modification string----------------->
    getModificationId : function(peptide, modificationString){
        const spaceRgx = /\s/gi;
        modificationString = modificationString.replace(spaceRgx,'');
        let result = {modification:[], PeptideType:'light'};
        let promise = new Promise(async (resolve, reject) => {
            //two types: C2(CAM);R14(heavy) or CAM|15

            //find out which type
            let type = "transListType"
            let testIfPeptideInfoType = /[\(]/gi;
            if (testIfPeptideInfoType.test(modificationString)){
                type = "peptideInfoType";
            }

            if(type == "transListType"){
                let mods = modificationString.split('|')
                for(let i = 0; i < mods.length; i++){
                    let Modification = "";
                    const capturingRegex = /^\d+$/;   //number only
                    if(capturingRegex.test(mods[i])){
                        Modification = 'Heavy' + peptide.charAt(mods[i]-1);
                    }else if(mods[i] == 'CAM'){  //not a number, then CAM  (other options need to be added manually)
                        Modification = 'CAM';
                    }
                    //get the modification id
                    if(Modification != ""){
                        let queryResult = await methods.queryDB({'Modification': Modification}, 'modifications', true);
                        //console.log(queryResult);

                        if(Modification == 'CAM'){
                            for(let i = 0; i < peptide.length; i++){
                                if(peptide.charAt(i) == 'C'){
                                    result['modification'].push({
                                        id: queryResult['queryResult'][0].id,
                                        Modification: queryResult['queryResult'][0].Modification,
                                        TargetedSite: queryResult['queryResult'][0].TargetedSite,
                                        ModificationType: queryResult['queryResult'][0].ModificationType,
                                        Position: i+1,
                                        AddedMass:queryResult['queryResult'][0].AddedMass
                                    });
                                }
                            }
                        }else if (Modification == 'Heavy' + peptide.charAt(mods[i]-1)){
                            result['modification'].push({
                                id: queryResult['queryResult'][0].id,
                                Modification: queryResult['queryResult'][0].Modification,
                                TargetedSite: queryResult['queryResult'][0].TargetedSite,
                                ModificationType: queryResult['queryResult'][0].ModificationType,
                                Position: Number(mods[i]),
                                AddedMass:queryResult['queryResult'][0].AddedMass
                            });
                            result['PeptideType'] = 'heavy';
                        }
                    }
                }
            }else{ //this is the preferred modification string format, and only this way has oxidized/pyroGlu
                let mods = modificationString.split(';');
                for(let i = 0; i < mods.length; i++){
                    const extractInfo = /(?<aminoAcid>[A-Z])(?<Position>\d+)\((?<Modification>\w+)\)/
                    if(extractInfo.test(mods[i])){
                        const found = mods[i].match(extractInfo);
                        //console.log(found.groups.Modification);
                        let Modification = found.groups.Modification;
                        if(Modification.toUpperCase() == 'HEAVY'){
                            Modification = 'Heavy' + found.groups.aminoAcid;
                            result['PeptideType'] = 'heavy';
                        }

                        Modification = (found.groups.Modification == 'PO3H2')?'Pho'+ found.groups.aminoAcid:Modification;
                        Modification = (found.groups.Modification == 'Ox')?'Ox'+ found.groups.aminoAcid:Modification;
                        Modification = (found.groups.Modification == 'Pyro')?'Pyro'+ found.groups.aminoAcid:Modification;
                        let queryResult = await methods.queryDB({'Modification': Modification}, 'modifications', true);
                        result['modification'].push({
                            id: queryResult['queryResult'][0].id,
                            Modification: queryResult['queryResult'][0].Modification,
                            TargetedSite: queryResult['queryResult'][0].TargetedSite,
                            ModificationType: queryResult['queryResult'][0].ModificationType,
                            Position: found.groups.Position,
                            AddedMass:queryResult['queryResult'][0].AddedMass
                        });
                        
                    }
                }
            }
            resolve(result);
        });
        return promise; //result is {modification:[{id:,Modification:,TargetedSite:,ModificationType:,Position:}]}
    }


}

module.exports.massFunctions = methods;