
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

function checkAllPeptide(){
    let checkStatus = document.getElementById("checkAllBoxes").checked;
    let peptideCheckboxes = document.getElementsByClassName("peptideCheckbox");
    for(let i = 0; i < peptideCheckboxes.length; i++){
        peptideCheckboxes[i].checked=checkStatus;
    }
}

function showHideText(e){
    e.className = e.className == "ellipsisCellWord"?"showEllipsisCellWord":"ellipsisCellWord";
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
        let downloadAllTrans = document.createElement("button");
        downloadAllTrans.className = "btn btn-info";
        downloadAllTrans.textContent = "Download Selected Transitions";
        downloadAllTrans.setAttribute('onclick', 'downloadAllTrans()');
        container.appendChild(downloadAllTrans);
        let downloadAllPeptide = document.createElement("button");
        downloadAllPeptide.className = "btn btn-info mx-2";
        downloadAllPeptide.textContent = "Download Selected Peptide Information";
        downloadAllPeptide.setAttribute('onclick', 'downloadAllPeptide()');
        container.appendChild(downloadAllPeptide);

        let container2 = document.createElement("div");
        container2.className = "row justify-content-center tableContainer1";
        let col1 = document.createElement("div");
        col1.className = "col-12";
        let table = document.createElement("table");
        table.id = "searchTable1";
        table.className = 'table mt-2';
        let headerArr = ['Catalog#','Uniprot#','Gene Symbol','Species','Peptide','Type','Quality','Modifications','Transitions'];
        let thead = document.createElement("thead");
        let theadrow = document.createElement("tr");
        let thCheckAll = document.createElement("th");
        thCheckAll.setAttribute('style','width:5px');
        let checkAllInput = document.createElement("input");
        checkAllInput.setAttribute("type","checkbox");
        checkAllInput.setAttribute("onclick", 'checkAllPeptide()');
        checkAllInput.id = "checkAllBoxes";
        thCheckAll.appendChild(checkAllInput);
        theadrow.appendChild(thCheckAll);
        for(let i = 0; i < headerArr.length; i++){
            let temp = document.createElement("th");
            if(headerArr[i] == 'Peptide'){
                temp.setAttribute('style','width: 200px');
                temp.innerHTML = headerArr[i];
            }else if(headerArr[i] == 'Type' || headerArr[i] == 'Quality' || headerArr[i] == 'In Stock' || headerArr[i] == 'Location'){
                temp.setAttribute('style','width: 80px');
                temp.textContent = headerArr[i];
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
            let checkCol = document.createElement("td");
            let checkboxCol = document.createElement("input");
            checkboxCol.setAttribute("type", "checkbox");
            checkboxCol.className = "peptideCheckbox";
            checkboxCol.id = receivedData.searchResult[i]["id"];
            checkCol.appendChild(checkboxCol);
            thisRow.appendChild(checkCol);
            for(let j = 0; j < headerArr.length; j++){
                let thisCol = document.createElement("td");
                if(headerArr[j] == 'Uniprot#' || headerArr[j] == 'Gene Symbol' || headerArr[j] == 'Species'){
                    thisCol.className = "ellipsisCellWord";
                    thisCol.setAttribute('onclick','showHideText(this)');
                }
                if(headerArr[j] == 'Peptide'){
                    thisCol.innerHTML = highlightAminoAcid(receivedData.searchResult[i][headerArr[j]],receivedData.searchResult[i]['Modifications']);
                }else if(headerArr[j] == 'Transitions'){
                    
                    if(receivedData.searchResult[i]['Transitions'].hasData){
                        let downloadLink = document.createElement("button");
                        downloadLink.id = 'trans' + receivedData.searchResult[i]['id'];
                        downloadLink.setAttribute('onClick', `downloadTrans([${receivedData.searchResult[i]["id"]}],'trans')`);
                        downloadLink.className = "btn btn-info";
                        downloadLink.textContent = "Download";
                        thisCol.appendChild(downloadLink);
                        //hidden span for peptide id with trans info
                        let peptideIdWithTransSpan = document.createElement("span");
                        peptideIdWithTransSpan.className = "peptideIdWithTrans";
                        peptideIdWithTransSpan.style = "display:none";
                        peptideIdWithTransSpan.textContent = receivedData.searchResult[i]['id'];
                        thisCol.appendChild(peptideIdWithTransSpan);
                    }else{
                        thisCol.textContent = 'Unavailable';
                    }

                    let peptideIdSpan = document.createElement("span");
                        peptideIdSpan.className = "peptideId";
                        peptideIdSpan.style = "display:none";
                        peptideIdSpan.textContent = receivedData.searchResult[i]['id'];
                        thisCol.appendChild(peptideIdSpan);
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

async function downloadTrans(peptideIds,fileType){
    //make post request to build download link to download trans
    let payload = {
        peptideIds : peptideIds,
        fileType : fileType
    }
    console.log(payload);

    await fetch('/api/download',{
        method: 'POST',
        headers: { 'Content-Type' : 'application/json'},
        body: JSON.stringify(payload)
    })
        .then((data1)=>{
            return data1.json();
        })
        .then((data2)=>{
            console.log(data2);
            //add a link and click on it to download the trans
            let downLnk = document.createElement("a");
            document.body.appendChild(downLnk);
            downLnk.id = 'templink1';
            downLnk.style = "display:none";
            downLnk.download = "";
            downLnk.href = data2.filelink;
            downLnk.click();
            document.body.removeChild(downLnk);
        })
        .catch((err) => {
            alert(err);
        })

}

async function downloadAllTrans(){
    let idElements = [...document.getElementsByClassName("peptideIdWithTrans")]
    let idsWithTrans = [];
    idElements.forEach((eachElement,index) => {
                                                idsWithTrans.push(eachElement.textContent);
                                              });
    let allPeptidesCheckboxes = [...document.getElementsByClassName("peptideCheckbox")];
    let idList = [];
    allPeptidesCheckboxes.forEach((eachBox,index) => {
                                        
                                        if(eachBox.checked){
                                            if(idsWithTrans.indexOf(eachBox.id) != -1){
                                                idList.push(eachBox.id);
                                            }
                                        }
                                    });
    
    if(idList.length == 0){
        alert("Peptides have no transitions information.");
    }else{
        console.log(idList);
        await downloadTrans(idList,'trans');
        alert("Transitions downloaded!");
    }
    
}

async function downloadAllPeptide(){
    let allPeptidesCheckboxes = [...document.getElementsByClassName("peptideCheckbox")];
    let idList = [];
    allPeptidesCheckboxes.forEach((eachBox,index) => {
        if(eachBox.checked){
            idList.push(eachBox.id);
        }
    })

    if(idList.length == 0){
        alert("No Peptides found");
    }else{
        console.log(idList);
        await downloadTrans(idList,'peptide');
        alert("Peptide Information downloaded!");
    }
    
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