document.addEventListener('DOMContentLoaded', () => {

    //remove the search function from the navbar
    document.getElementById("searchBtn").addEventListener("click", function(event){
        event.preventDefault();
        performSearch();
    })

    //add enter key detection to input_search
    document.getElementById("searchItem").addEventListener("keyup", function(event){
        event.preventDefault();
        if(event.keyCode === 13){
            
            event.preventDefault();
            //document.getElementById("searchBtn").click();
            performSearch();
        }
    })


});

function performSearch(){
    /*let payload = {'searchTerm':document.getElementById("searchItem").value,
                   'peptide':"try",
                   'catalogNum':""
    };*/

    let payload = getSearchPayload();
    console.log(payload);
    fetch('/api/search',{
        method:'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then((data1)=>{
            return data1.json();
        })
        .then((data2) => {
            printData(data2);
        })
        .catch((err) => {
            console.log(err);
        })
}

function getSearchPayload(){
    let payload = {
        'searchTerm' : document.getElementById("searchItem").value,
        'searchColumn' : document.getElementById("searchColumn").value,
        'exactMatch' : false
    }
    if(document.getElementById('exactMatchCB').checked){
        payload.exactMatch = true;
    }
    return payload;
}

/*
function performInsert(){
    let payload = {fileLink:document.getElementById("insertItem").value,
                   filename:document.getElementById("insertItem2").value,
                   aid:get_aid(document.getElementById("insertItem").value),
                   exactLnk:document.getElementById("insertItem").value,
                   linkItemName:document.getElementById("insertItem2").value,
                   rejectBefore:false,
                   table:document.getElementById("insertItem3").value      //or episode_link          
    };
    console.log(payload);
    fetch('/api/insert',{
        method:'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then((data1)=>{
            return data1.json();
        })
        .then((data2) => {
            printData(data2);
        })
        .catch((err) => {
            console.log(err);
        })
}
*/
function printData(receivedData){  //write html table

    console.log(receivedData);
    if(document.getElementById('searchResult1') !== null){
        let lastSearch = document.getElementById('searchResult1');
        lastSearch.parentNode.removeChild(lastSearch);        
    }

    let container = document.createElement("div");
    container.id = "searchResult1";
    container.className = "container mt-5";
    if(receivedData.error !== undefined){
        let textMsg = document.createElement("p");
        textMsg.textContent = receivedData.error;
        container.appendChild(textMsg);
    }else{
        let textMsg = document.createElement("p");
        textMsg.textContent = receivedData.peptideCount + ' items found:';
        container.appendChild(textMsg);

        let container2 = document.createElement("div");
        container2.className = "row justify-content-center";
        let col1 = document.createElement("div");
        col1.className = "col-12";
        let table = document.createElement("table");
        table.id = "searchTable1";
        table.className = 'table mt-2';
        let headerArr = ['Accession#','Catalog#','Protein','Peptide','Type','Quality','In Stock','Location','Modifications'];
        let thead = document.createElement("thead");
        let theadrow = document.createElement("tr");
        for(let i = 0; i < headerArr.length; i++){
            let temp = document.createElement("th");
            if(headerArr[i] == 'Peptide'){
                temp.setAttribute('style','width: 200px');
                temp.innerHTML = headerArr[i];
            }else{
                temp.textContent = headerArr[i];
            }
            theadrow.appendChild(temp);
        } 
        thead.appendChild(theadrow);
        table.appendChild(thead);

        let tbody = document.createElement("tbody");
        for(let i = 0; i < receivedData.searchResult.length; i++){
            let thisRow = document.createElement("tr");
            for(let j = 0; j < headerArr.length; j++){
                let thisCol = document.createElement("td");
                if(headerArr[j] == 'Peptide'){
                    thisCol.innerHTML = highlightAminoAcid(receivedData.searchResult[i][headerArr[j]],receivedData.searchResult[i]['Modifications']);
                }else{
                    thisCol.textContent = receivedData.searchResult[i][headerArr[j]];
                }
                thisRow.appendChild(thisCol);
            }
            tbody.appendChild(thisRow);
        }
        table.appendChild(tbody);
        col1.appendChild(table);
        container2.appendChild(col1);
        container.appendChild(container2);
    }

    let body = document.getElementsByTagName("body")[0];
    body.appendChild(container);
}

function highlightAminoAcid(peptide, modificationString){
    //return HTML for peptide

    let AAarr = [];
    for(let i = 0; i < peptide.length; i++){
        AAarr.push(peptide.charAt(i));
    }

    let modList = modificationString.split(',');
    let extractNamePos = /(?<modName>\w+)\((?<modPos>\d+)\)/;
    for(let i = 0; i < modList.length; i++){
        
        if(extractNamePos.test(modList[i])){
            //console.log(modList[i]);
            const found = modList[i].match(extractNamePos);
            let modification = found.groups.modName;
            if(modification != 'null'){
                if(modification.substr(0,5).toUpperCase() == 'HEAVY'){
                    AAarr[found.groups.modPos-1] = '<span style="color:red">' + AAarr[found.groups.modPos-1] + '</span>';
                }else{
                    AAarr[found.groups.modPos-1] = '<u style="color:blue">' + AAarr[found.groups.modPos-1] + '</u>';
                }
            }
        }
    }

    let modPeptideHTML = '';
    for(let i = 0; i < AAarr.length; i++){
        modPeptideHTML = modPeptideHTML + AAarr[i];
    }

    return modPeptideHTML;

}

/* This function performs extensive input test using regular expression.*/
function get_aid(targetInput){
    const regex = RegExp(/aid=([0-9]+)/);
    let match = targetInput.match(regex);
    if (match != null){
        return match[1];
    }else{
        return -1;
    }
}   