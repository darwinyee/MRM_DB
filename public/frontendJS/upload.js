document.getElementById('uploadTransFileBtn').addEventListener('click', (event)=>{
    //make http request
    if(document.getElementById('uploadTransFile').files.length == 0){
        alert("No file selected!");
    }else{
        fetch('/uploadItem/uploadTrans',{
            method: 'POST',
            body: getMultiformData('uploadTrans')
        })
            .then((data1) => {
                return data1.json();
            })
            .then((data2) => {
                console.log(data2);
            })
            .catch((err) => {
                console.log(err);
            });
    }
});

document.getElementById('uploadDBFileBtn').addEventListener('click', (event) => {
    if(document.getElementById('uploadDBFile').files.length == 0){
        alert("No file selected!");
    }else{
        fetch('/uploadItem/uploadProteinDB',{
            method: 'POST',
            body: getMultiformData('uploadDB')
        })
            .then((data1) => {
                return data1.json();
            })
            .then((data2) => {
                console.log(data2);
            })
            .catch((err) => {
                console.log(err);
            });
    }
});

document.getElementById('uploadNewPeptideFileBtn').addEventListener('click', (event) => {
    if(document.getElementById('uploadNewPeptideFile').files.length == 0){
        alert("No file selected!");
    }else{
        fetch('/uploadItem/uploadNewPeptide',{
            method: 'POST',
            body: getMultiformData('uploadNewPeptide')
        })
            .then((data1) => {
                return data1.json();
            })
            .then((data2) => {
                console.log(data2);
            })
            .catch((err) => {
                console.log(err);
            });
    }
});

function getMultiformData(htmlFileInputFormName){
    let form = document.forms.namedItem(htmlFileInputFormName);
    let formData = new FormData(form);
    return formData;
}