document.getElementById('uploadOptions').addEventListener('click', (event)=>{
    let extraOption = document.getElementById('cautiousItems');
    if(extraOption.style.display == 'none'){
        extraOption.style.display = 'block';
        document.getElementById('uploadOptions').textContent = 'Hide Upload Options';
    }else{
        extraOption.style.display = 'none';
        document.getElementById('uploadOptions').textContent = 'Show More Upload Options';
    }
});

document.getElementById('uploadTransFileBtn').addEventListener('click', (event)=>{

    //modal
    let loadingModal = document.getElementById('loadingModalStatus');
    loadingModal.textContent = "Uploading transitions...";
    $('#LoadingModal1').modal();

    //make http request
    if(document.getElementById('uploadTransFile').files.length == 0){
        loadingModal.textContent = "No file selected!";
        hideModalAfterMillisecond(2000);
        //alert("No file selected!");
    }else{
        fetch('/uploadItem/uploadTrans',{
            method: 'POST',
            body: getMultiformData('uploadTrans')
        })
            .then((data1) => {
                return data1.json();
            })
            .then((data2) => {
                //console.log(data2);
                loadingModal.textContent = data2.status;
                hideModalAfterMillisecond(2000);
                
            })
            .catch((err) => {
                //console.log(err);
                loadingModal.textContent = err;
                hideModalAfterMillisecond(5000);
            });
    }
});

document.getElementById('uploadDBFileBtn').addEventListener('click', (event) => {
    //modal
    let loadingModal = document.getElementById('loadingModalStatus');
    loadingModal.textContent = "Uploading new protein database...";
    $('#LoadingModal1').modal();

    if(document.getElementById('uploadDBFile').files.length == 0){
        loadingModal.textContent = "No file selected!";
        hideModalAfterMillisecond(2000);
    }else{
        fetch('/uploadItem/uploadProteinDB',{
            method: 'POST',
            body: getMultiformData('uploadDB')
        })
            .then((data1) => {
                return data1.json();
            })
            .then((data2) => {
                //console.log(data2);
                loadingModal.textContent = data2.status;
                hideModalAfterMillisecond(2000);
            })
            .catch((err) => {
                console.log(err);
                loadingModal.textContent = err;
                hideModalAfterMillisecond(5000);
            });
    }
});

document.getElementById('uploadNewPeptideFileBtn').addEventListener('click', (event) => {
    //modal
    let loadingModal = document.getElementById('loadingModalStatus');
    loadingModal.textContent = "Uploading new peptides...";
    $('#LoadingModal1').modal();

    if(document.getElementById('uploadNewPeptideFile').files.length == 0){
        //alert("No file selected!");
        loadingModal.textContent = "No file selected!";
        hideModalAfterMillisecond(2000);
    }else{
        fetch('/uploadItem/uploadNewPeptide',{
            method: 'POST',
            body: getMultiformData('uploadNewPeptide')
        })
            .then((data1) => {
                return data1.json();
            })
            .then((data2) => {
                //console.log(data2);
                loadingModal.textContent = data2.status;
                hideModalAfterMillisecond(2000);
            })
            .catch((err) => {
                console.log(err);
                loadingModal.textContent = err;
                hideModalAfterMillisecond(5000);
            });
    }
});

document.getElementById('transTemplate').addEventListener('click', (event) => {
    event.preventDefault();
    getTemplate('trans');
});

document.getElementById('peptideTemplate').addEventListener('click', (event) => {
    event.preventDefault();
    getTemplate('peptide');
});


function getTemplate(fileType){
    let payload = {fileType:fileType};
    fetch('/uploadItem/sampleTemplate',{
        method:'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
      .then((data1) => {
          return data1.json();
      })
      .then((data2) => {
          if(data2.error !== undefined){
              alert(data2.error);
          }else{
              //add a link and click on it to download the trans
            let downLnk = document.createElement("a");
            document.body.appendChild(downLnk);
            downLnk.id = 'templink1';
            downLnk.style = "display:none";
            downLnk.download = "";
            downLnk.href = data2.filelink;
            downLnk.click();
            document.body.removeChild(downLnk);
          }
      })
      .catch((err) => {
          alert(err);
      })
}

function hideModalAfterMillisecond(milliseconds){
    setTimeout(()=>{
        $('#LoadingModal1').modal('hide');
    },milliseconds);
}

function getMultiformData(htmlFileInputFormName){
    let form = document.forms.namedItem(htmlFileInputFormName);
    let formData = new FormData(form);
    return formData;
}