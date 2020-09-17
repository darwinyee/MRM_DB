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
    getMass : function(peptideSeq, modifications, peptideType, wholePeptideLength){
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

        for(let i = 0; i < modifications.length; i++){
            let adjPos = modifications[i].Position - yOffset;
            if(adjPos > 0 && adjPos <= peptideSeq.length){
                if(modifications[i].ModificationType == 'heavy'){
                    heavyMass = heavyMass + modifications[i].AddedMass;
                }else{
                    heavyMass = heavyMass + modifications[i].AddedMass;
                    totalMass = totalMass + modifications[i].AddedMass;
                }
            }
        }

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

        //{b+:[b1,b2,....],b++:[],y+:[y1,y2,...],y++[]}

        let result = {};
        let curProductCharge = '';
        for(let productCharge = 1; productCharge <= productMaxCharge; productCharge++){
            curProductCharge = curProductCharge + '+';
            for(let i = 0; i < peptideSeq.length-1; i++){  //only from 1 to n-1 peptide length
                //b-ion
                let bIonName = 'b'+ (i + 1);
                let curBion = peptideSeq.substr(0,(i+1));
                let curBmass = methods.getMass(curBion,modifications,'b');
                let curLightBmz = methods.getMz(curBmass.lightMW,productCharge);
                let curHeavyBmz = methods.getMz(curBmass.heavyMW,productCharge);
                let curBMasses = {};
                curBMasses[bIonName] = {lightMW:curLightBmz,heavyMW:curHeavyBmz};
                let bIonChargeName = 'b' + curProductCharge;
                if(!result.hasOwnProperty(bIonChargeName)){
                    result[bIonChargeName] = [];
                }
                result[bIonChargeName].push(curBMasses);

                //y-ion
                let yIonName = 'y'+ (i+1);
                let curYion = peptideSeq.substr(peptideSeq.length-1-i,(i+1));
                let curYmass = methods.getMass(curYion, modifications, 'y');
                let curLightYmz = methods.getMz(curYmass.lightMW,productCharge);
                let curHeavyYmz = methods.getMz(curYmass.heavyMW,productCharge);
                let curYMasses = {};
                curYMasses[yIonName] = {lightMW:curLightYmz,heavyMW:curHeavyYmz};
                let yIonChargeName = 'y' + curProductCharge;
                if(!result.hasOwnProperty(yIonChargeName)){
                    result[yIonChargeName] = [];
                }
                result[yIonChargeName].push(curYMasses);
            }
        }
        return result;
    }

}

module.exports.massFunctions = methods;