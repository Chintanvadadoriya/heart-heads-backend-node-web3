const config = {
    secret: '!@#456QWErty',
    mainnet_public_rpc_node: 'https://ethereum.publicnode.com',
    adminAddresses: ["0xa7633f37feefacac8f251b914e92ff03d2acf0f2", "0x0BF373dBbEe2AC7Af7028Ae8027a090EACB9b596","0xB4b6aB108DB5297eE2DFA000d1b36eE21D1bB471"],
    zeroAddress: "0x0000000000000000000000000000000000000000",
    claim: "0x2353cca8798b6e6be4c3f308923d58f220fa2bf1",
    HexToysAddress: "0xa35a6162eaecddcf571aeaa8edca8d67d815cee4",
    marketplaceV2: process.env.MARKET_PULSE_V2,
    pulseTokenAddress:'0x0000000000000000000000000000000000000000'
};


module.exports = config;
