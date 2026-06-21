const n = 'aab';
let res=''
// const map = new Map()
    // for(let i=0;i<n.length;i++){
    //     let res=''
    //     for(let j=0;j<=i;j++){
    //         res+=n[j]
    //     }
    //     console.log(res)
    // }
     for(let i=n.length-1;i>0;i--){
        let res=''
        for(let j=i;j>=0;j--){
            res+=n[j]
        }
        console.log(res)
    }