async function GetFunding(Crypto){
    const data = await fetch(`https://openapi.blofin.com/api/v1/market/funding-rate?instId=${Crypto}-USDT`);
    const json = await data.json();
    console.log(`${Crypto}-USDT : ${json.data[0].fundingRate}`)
    return json;
}
GetFunding("H")
export default GetFunding;
