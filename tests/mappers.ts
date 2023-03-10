import * as anchor from "@project-serum/anchor";
import { Mappers } from "../target/types/mappers";
import { expect } from 'chai';

function shortKey(key: anchor.web3.PublicKey) {
  return key.toString().substring(0, 8);
}

describe("mappers", () => {
  
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Mappers as anchor.Program<Mappers>;
  
  async function generateKeypair() {
    let keypair = anchor.web3.Keypair.generate();
    await provider.connection.requestAirdrop(
      keypair.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await new Promise( resolve => setTimeout(resolve, 3 * 1000) ); // Sleep 3s
    return keypair;
  }

  async function derivePda(parentHex: string, pubkey: anchor.web3.PublicKey, pda_string: string) {
    let [pda, _] = await anchor.web3.PublicKey.findProgramAddress(
      [
        pubkey.toBuffer(),
        Buffer.from(pda_string),
        Buffer.from(parentHex),
      ],
      program.programId
    );
    return pda;
  }

  async function deriveHexBitmapPda(parentHex: string, pubkey: anchor.web3.PublicKey, pda_string: string, devEui: string) {
    let [pda, _] = await anchor.web3.PublicKey.findProgramAddress(
      [
        pubkey.toBuffer(),
        Buffer.from(pda_string),
        Buffer.from(parentHex),
        Buffer.from(devEui),
      ],
      program.programId
    );
    return pda;
  }


  async function createUserAccount(
    discordid: String, 
    pda: anchor.web3.PublicKey, 
    wallet: anchor.web3.Keypair
  ) {
    await program.methods.createUser(discordid)
      .accounts({
        userAccount: pda,
        wallet: wallet.publicKey,
      })
      .signers([wallet])
      .rpc();
  }

  async function createMapperAccount(
    deveui: String,
    name: String,
    pda: anchor.web3.PublicKey, 
    wallet: anchor.web3.Keypair
  ) {
    await program.methods.createMapper(deveui,name)
      .accounts({
        mapperAccount: pda,
        wallet: wallet.publicKey,
      })
      .signers([wallet])
      .rpc();
  }

  async function createHexbitmapAccount(
    parentHex: string,
    devEui: string,
    pda: anchor.web3.PublicKey, 
    wallet: anchor.web3.Keypair
  ) {
    await program.methods.createHexbitmap(parentHex, devEui)
      .accounts({
        hexbitmapAccount: pda,
        wallet: wallet.publicKey,
      })
      .signers([wallet])
      .rpc();
  }

  async function modifyHexbitmap(
    parentHex: string, 
    childHex: string,
    wallet: anchor.web3.Keypair,
    devEui: string,
  ) {

    console.log("--------------------------------------------------");
    let data;
    //let pda = await derivePda(parentHex, wallet.publicKey,"R9HEXBITMAP");
    console.log(`deveui ${devEui}`);
    console.log(`parentHex ${parentHex}`);
    
    let pda = await deriveHexBitmapPda(parentHex, wallet.publicKey, "R9HEXBITMAP", devEui);

    console.log(`Checking if account ${shortKey(pda)} exists for r5hex: ${parentHex} for device ${devEui}`);
    try {

      data = await program.account.hexbitmap.fetch(pda);
      console.log("It does.");
    
    } catch (e) {
    
      console.log("It does NOT. Creating...");
      await createHexbitmapAccount(parentHex, devEui, pda, wallet);
      data = await program.account.hexbitmap.fetch(pda);
    };

    console.log("Success.");
    console.log("Data:")
    console.log(`    r5hex: ${data.parentHex}`);
    //console.log(`Modifying balance of ${data.parentHex} from ${data.children} to ${childHex}`);

    await program.methods.modifyHexbitmap(childHex)
      .accounts({
        hexbitmapAccount: pda,
        wallet: wallet.publicKey,
      })
      .signers([wallet])
      .rpc();

    data = await program.account.hexbitmap.fetch(pda);
    console.log("New Data:")
    console.log(`    r5hex: ${data.parentHex}`);
    console.log("Success.");
  }


  it("Create a New User", async () => {
    const wallet = await generateKeypair();
    let discord_id = "407735733265235979";
    let pda = await derivePda(discord_id, wallet.publicKey,"USERCONFIG");

    console.log(`Checking if account ${pda} exists for discord_id: ${discord_id}...`);
    try {
      let data = await program.account.user.fetch(pda);
      console.log(`It does. ${data}`);
    
    } catch (e) {
      console.log("It does NOT. Creating...");
      await createUserAccount(discord_id, pda, wallet);
      let data = await program.account.user.fetch(pda);
    };

    console.log("Success.");
  });  

  it("Create a New Mapper", async () => {
    const wallet = await generateKeypair();
    let deveui = "FFFFFFFFFFFFFFFF";
    let pda = await derivePda(deveui, wallet.publicKey,"MAPPERCONFIG");

    console.log(`Checking if account ${shortKey(pda)} exists for deveui: ${deveui}...`);
    try {
      let data = await program.account.mapper.fetch(pda);
      console.log(`It does. ${data}`);
    
    } catch (e) {
      console.log("It does NOT. Creating...");
      let name = "MyMapper";
      await createMapperAccount(deveui, name, pda, wallet);
      let data = await program.account.mapper.fetch(pda);
    };

    console.log("Success.");
  });  

  it("Create a New User and read back account data", async () => {
    const wallet = await generateKeypair();
    let id = "407735733265235978";
    let pda = await derivePda(id, wallet.publicKey,"USERCONFIG");

    console.log(`Checking if account ${pda} exists for discord id: ${id}...`);
    try {
      let data = await program.account.user.fetch(pda);
      console.log(`It does. ${data}`);
    
    } catch (e) {
      console.log("It does NOT. Creating...");
      let id = "407735733265235978";
      await createUserAccount(id, pda, wallet);
      let data = await program.account.user.fetch(pda);
    };

    console.log(`Checking if account ${pda} exists for discord id: ${id}...`);
  
    let data = await program.account.user.fetch(pda);
    console.log(`It does. Discord id ${data.discordid} is on team ${data.team}`);
  

    console.log("Success.");
  });  


  it("Create a New Mapper and read back account data", async () => {
    const wallet = await generateKeypair();
    let deveui = "FFFFFFFFFFFFFFFF";
    let pda = await derivePda(deveui, wallet.publicKey,"MAPPERCONFIG");

    console.log(`Checking if account ${shortKey(pda)} exists for deveui: ${deveui}...`);
    try {
      let data = await program.account.mapper.fetch(pda);
      console.log(`It does. ${data}`);
    
    } catch (e) {
      console.log("It does NOT. Creating...");
      let name = "MyMapper";
      await createMapperAccount(deveui, name, pda, wallet);
      let data = await program.account.mapper.fetch(pda);
    };

    console.log(`Checking if account ${shortKey(pda)} exists for deveui: ${deveui}...`);
    try {
      let data = await program.account.mapper.fetch(pda);
      console.log(`It does. Mapper named ${data.name} has deveui ${data.deveui}`);
    
    } catch (e) {
      console.log("It does NOT. Creating...");
      let name = "MyMapper";
      await createMapperAccount(deveui, name, pda, wallet);
      let data = await program.account.mapper.fetch(pda);
    };

    console.log("Success.");
  });  



  it("An example of PDAs in action", async () => {
    const testKeypair1 = await generateKeypair();
    await modifyHexbitmap("8512ea6ffffffff", "8912ea6d803ffff", testKeypair1, "0123456789abcdef");
    /*await modifyLedger("8512ea6ffffffff", "8912ea6c003ffff", testKeypair1);
    await modifyLedger("8512ea6ffffffff", "8912ea6c00fffff", testKeypair1);
    await modifyLedger("8512ea6ffffffff", "8912ea6c007ffff", testKeypair1);
    await modifyLedger("8512ea6ffffffff", "8912ea6c017ffff", testKeypair1);
    await modifyLedger("8512ea6ffffffff", "8912ea6c013ffff", testKeypair1);
    await modifyLedger("8512ea6ffffffff", "8912ea6c01bffff", testKeypair1);
    await modifyLedger("8512ea6ffffffff", "8912ea6c00bffff", testKeypair1);
    await modifyLedger("8512ea6ffffffff", "8912ea6c0abffff", testKeypair1);
    await modifyLedger("8512ea6ffffffff", "8912ea6c0bbffff", testKeypair1);
    await modifyLedger("8512ea6ffffffff", "8912ea6c08fffff", testKeypair1);
    */
    expect(true).to.equal(true);
  });


  it("Test duplicate hex", async () => {
    const testKeypair2 = await generateKeypair();
    console.log("Test Duplicate");
    const deveui = "0123456789abcdef";

    await modifyHexbitmap("8512ccd3fffffff", "8912ccd04a3ffff", testKeypair2, "0123456789abcdef");
    try{
      await modifyHexbitmap("8512ccd3fffffff", "8912ccd04a3ffff", testKeypair2, "0123456789abcdef");
    } catch(err: any) {
        console.log(`error ${err.message}`);
        var expected = `Error Code: HexMapped. Error Number: 6000. Error Message: Resolution 9 hexagon has already been covered by this mapper.`
        expect(err.message.slice(err.message.length-expected.length)).to.equal(expected);
    }
  });

  it("Test an invalid hex", async () => {
    const testKeypair1 = await generateKeypair();
    const deveui = "0123456789abcdef";
    try{
      await modifyHexbitmap("8512ea6ffffffff", "9912ea6d803ffff", testKeypair1, "0123456789abcdef");
    } catch(err: any) {
      console.log(`error ${err.message}`);
      var expected = `Error Code: InvalidCell. Error Number: 6001. Error Message: This is not a valid Uber H3 Mode 1 cell or index.`
      expect(err.message.slice(err.message.length-expected.length)).to.equal(expected);
    }
  });

  it("Incorrect resolution", async () => {
    const testKeypair1 = await generateKeypair();
    const deveui = "0123456789abcdef";
    try{
      await modifyHexbitmap("8512ea6ffffffff", "8812ea6d803ffff", testKeypair1, "0123456789abcdef");
    } catch(err) {
      console.log(`error ${err.message}`);
      var expected = `Error Code: IncorrectRes9. Error Number: 6002. Error Message: Incorrect cell resolution. Expecting resolution 9 or higher.`
      expect(err.message.slice(err.message.length-expected.length)).to.equal(expected);
    }

  });  

});