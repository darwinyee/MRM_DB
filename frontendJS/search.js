document.addEventListener('DOMContentLoaded', () => {

    //remove the search function from the navbar
    document.getElementById("searchBtn").addEventListener("click", function(event){
        event.preventDefault();
        performSearch();
    })

    //add enter key detection to input_search
    document.getElementById("searchItem").addEventListener("keyup", function(event){
        if(event.keyCode === 13){
            event.preventDefault();
            document.getElementById("searchBtn").click();
        }
    })

    //remove the search function from the navbar
    document.getElementById("insertBtn").addEventListener("click", function(event){
        event.preventDefault();
        performInsert();
    })
});

function performSearch(){
    let payload = {'searchTerm':document.getElementById("searchItem").value,
                   'table':document.getElementById("insertItem3").value      //or episode_link          
    };
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

function printData(receivedData){
    console.log(receivedData);
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