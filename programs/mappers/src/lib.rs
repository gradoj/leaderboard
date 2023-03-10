use anchor_lang::prelude::*;

declare_id!("BHEzNP321byyJcSngpuR4z8D5XPJ3bTL7SADbNugTAJA");

#[error_code]
pub enum MyError {
    #[msg("Resolution 9 hexagon has already been covered by this mapper")]
    HexMapped,
    #[msg("This is not a valid Uber H3 Mode 1 cell or index")]
    InvalidCell,
    #[msg("Incorrect cell resolution. Expecting resolution 9 or higher")]
    IncorrectRes9,
}


#[program]
pub mod mappers {
    use super::*;

    pub fn create_user(
        ctx: Context<CreateUser>,
        discordid: String,
    ) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        user_account.discordid = String::from(discordid);

        let num: i64 = user_account.discordid.parse().unwrap();
        if num%2==0{
            user_account.team = String::from("red");
        }
        else {
            user_account.team = String::from("blue");
        }
        
        msg!("created pda with discord id {} on team {}", user_account.discordid, user_account.team);
        
        Ok(())    
    
    }

    pub fn create_mapper(
        ctx: Context<CreateMapper>,
        deveui: String,
        name: String,
    ) -> Result<()> {
        let mapper_account = &mut ctx.accounts.mapper_account;
        mapper_account.deveui = deveui.to_string();
        mapper_account.name = String::from(name);
        
        msg!("create pda with mapper deveui {} named {}", mapper_account.deveui, mapper_account.name);
        
        Ok(())    
    
    }

    pub fn create_hexbitmap(
        ctx: Context<CreateHexbitmap>,
        parent_hex: String,
        deveui: String,
    ) -> Result<()> {

        let hexbitmap_account = &mut ctx.accounts.hexbitmap_account;
        hexbitmap_account.parent_hex = parent_hex;
        hexbitmap_account.deveui = deveui;
        //ledger_account.children[0] = 0b0;
        
        msg!("create pda with parent hex {}", hexbitmap_account.parent_hex);

        Ok(())
    }

    pub fn modify_hexbitmap(
        ctx: Context<ModifyHexbitmap>,
        new_res9: String,
    ) -> Result<()> {

        let hexbitmap_account = &mut ctx.accounts.hexbitmap_account;

        /*
        https://observablehq.com/@nrabinowitz/h3-index-bit-layout?collection=@nrabinowitz/h3
        85283473fffffff
        0000100001010010100000110100011100111111111111111111111111111111

        start bit           bits        type            value
        0	                1	        Reserved	    0
        1	                4	        Index Mode	    1
        5	                3	        Mode-Dependent	0
        8	                4	        Resolution	    5        
        12	                7	        Base Cell	    20
	    19	                3	        Res 1 digit	    0
        22	                3	        Res 2 digit	    6
        25	                3	        Res 3 digit	    4
        28	                3	        Res 4 digit	    3
        31	                3	        Res 5 digit	    4
        34	                3	        Res 6 digit	    7
        37	                3	        Res 7 digit	    7
        40	                3	        Res 8 digit	    7
        43	                3	        Res 9 digit	    7
        46	                3	        Res 10 digit	7
        49	                3	        Res 11 digit	7
        52	                3	        Res 12 digit	7
        55	                3	        Res 13 digit	7
        58	                3	        Res 14 digit	7
        61	                3	        Res 15 digit	7
        */

        let mut new_res9 = new_res9.to_owned();

        // if it is length 15 then just add the assumed leading zero
        if new_res9.len() == 15 {
            let prefix = "0";
            new_res9.insert_str(0, prefix);
        }
        else if new_res9.len() == 16 {
            // do nothing and keep going
        }
        else{
            return err!(MyError::InvalidCell);
        }

        // break the hex string into low and high for 2 x u32. bit wise operators not implemented for u64.
        // this ends up breaking the r5 3-bit resolution up but it is not currently used anyway
        let mode = &new_res9[0..8];
        let res = &new_res9[8..16];
        //msg!("mode {}", mode);
        //msg!("res {}", res);

        // the length appears correct so far. now try reading out the upper hex string as base 16
        match <u32>::from_str_radix(mode, 16) {
            Ok(sk) => {
                // check upper byte is 8: reserved bit = 0, Index Mode = 1, Mode Dependent = 0
                if ((sk >> 24) & 0xFF) != 8 {
                    msg!("{} is not equal to 8", (sk >> 24) & 0xFF);
                    return err!(MyError::InvalidCell);
                }
                // these 4 bits are resolution. we need at least res 9 or error out. higher res is okay - it gets tossed
                if ((sk >> 20) & 0xF) < 9 {
                    msg!("hex resolution {} too low", (sk >> 20) & 0xF);
                    return err!(MyError::IncorrectRes9);
                }
                    
            }
            Err(e) => {
                msg!("parsing base 16 error {:?}", e);
                return err!(MyError::InvalidCell);
            },
            }    
        
        // if we've made it here it's time to parse the resolution lower bytes of the hex
        match <u32>::from_str_radix(res, 16) {
        Ok(sk) => { 

            // we're only interested in 12-bits corresponding to r9-r6
            let b = (sk >> 18) & 0x00000FFF;

            let r9 = ((b & 0b111) >> 0).to_string();
            let r8 = ((b & 0b111000) >> 3).to_string();
            let r7 = ((b & 0b111000000) >> 6).to_string();
            let r6 = ((b & 0b111000000000) >> 9).to_string();
            /*
              if i concat these together i'll get a base 7 string which is handy 
              because then i can use this as an offset as a bit for each hex
              eg. there are 2400 res 9 hexes in one resolution 5 hex
                  0b110 110 110 110
                    6   6   6   6
                    r6  r7  r8  r9
                '6666' in base7 is 2400 so for this hex the very last bit 2400 would be set
            */
            let result = format!("{}{}{}{}", r6, r7, r8, r9);
            msg!("h3 hex resolution in base 7 {:}", result );
            
            match <u32>::from_str_radix(&result, 7) {
            Ok(c) => { 
                msg!("base 10 {:?}", c );
                let byte_index = c/8;
                let existing_byte = hexbitmap_account.children[byte_index as usize];
                let new_bit = (1 << (c % 8)) as u8;

                // if new_bit and data (0b00100000 & 0b11111111) > 0 means bit was already set
                if (new_bit & existing_byte) > 0 {
                    return err!(MyError::HexMapped);
                }

                // each res9 is stored as a single bit in an array of bytes for each r5 hex account
                hexbitmap_account.children[byte_index as usize] = new_bit | existing_byte;
                msg!("set bit {} in byte {:?}", (c % 8), byte_index );                
            },
            Err(e) => {
                msg!("error child_int {:?}", e);
            },
            }    

        }
        Err(e) => {
            msg!("error child_int {:?}", e);
        },
        } 

        msg!("add new hex res9 child {} to res5 parent {}", new_res9, hexbitmap_account.parent_hex );
        Ok(())
    }

}    

// this is used to map coverage by hotspots and mapped by a device. generic uber h3 hex bitmap
#[derive(Accounts)]
#[instruction(parent_hex: String, deveui: String)]
pub struct CreateHexbitmap<'info> {
    #[account(
        init,
        payer = wallet,
        space = 600,
        seeds = [
            wallet.key().as_ref(),
            b"R9HEXBITMAP",
            parent_hex.as_ref(),
            deveui.as_ref(),   // deveui of mapper or address of hotspot
        ],
        bump
    )]
    pub hexbitmap_account: Account<'info, Hexbitmap>,
    #[account(mut)]
    pub wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Creates a new account for Res5 parent hexes for hotspot hex bitmaps
/*#[derive(Accounts)]
#[instruction(parent_hex: String)]
pub struct CreateHotspothexbitmap<'info> {
    #[account(
        init,
        payer = wallet,
        space = 600,
        seeds = [
            wallet.key().as_ref(),
            b"R9HOTSPOTHEXBITMAP",
            parent_hex.as_ref(),
        ],
        bump
    )]
    pub hexbitmap_account: Account<'info, Hexbitmap>,
    #[account(mut)]
    pub wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}*/

#[derive(Accounts)]
#[instruction(discordid: String)]
pub struct CreateUser<'info> {
    #[account(
        init,
        payer = wallet,
        space = 100,
        seeds = [
            wallet.key().as_ref(),
            b"USERCONFIG",
            discordid.as_ref(),
        ],
        bump
    )]
    pub user_account: Account<'info, User>,
    #[account(mut)]
    pub wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(deveui: String)]
pub struct CreateMapper<'info> {
    #[account(
        init,
        payer = wallet,
        space = 80,
        seeds = [
            wallet.key().as_ref(),
            b"MAPPERCONFIG",
            deveui.as_ref(),
        ],
        bump
    )]
    pub mapper_account: Account<'info, Mapper>,
    #[account(mut)]
    pub wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Used to update a User's hex bitmap record
#[derive(Accounts)]
pub struct ModifyHexbitmap<'info> {
    #[account(mut)]
    pub hexbitmap_account: Account<'info, Hexbitmap>,
    #[account(mut)]
    pub wallet: Signer<'info>,
}

// This account stores a user's info. One discord User can have many Mappers(devices with deveui)
#[account]
pub struct User {
    pub discordid: String,
    pub team: String, 
}

// This account stores a mapper device's information. The deveui is linked to a discord id
// When packets come from console they only contain the deveui so this allows one User to
// have multiple mapper devices. All their devices will be on one team and funds for all
// their mappers can come from one account
#[account]
pub struct Mapper {
    pub deveui: String,
    pub name: String,
    pub discordid: String,
}

// This account stores res 9 hexes of where a mapper(sensor) has sent packets from
#[account]
pub struct Hexbitmap {
    pub parent_hex: String,
    pub deveui: String,
    // require R5*R6*R7*R8*R9. 1*7*7*7*7=2401 resolution 9 hexes. One bit each r9 hex requires 300.125 bytes
    // borsh deserialize does not allow 301 bytes. use 512 for now but this is 200 expensive bytes unused
    pub children: [u8; 512], 
}
