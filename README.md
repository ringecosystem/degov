<div align="center">

![logo](docs/DeGov.AI.svg)

</div>

# DeGov.AI

DeGov.AI is an open-source, on-chain governance platform built for DAOs in the Ethereum related ecosystem. It leverages the [Governor Framework from OpenZeppelin](https://docs.openzeppelin.com/contracts/5.x/governance) to deliver a robust, flexible, and transparent governance solution for decentralized organizations. Check out the DAOs powered by DeGov.AI at [square.degov.ai](https://square.degov.ai).

## Features

- **Open**: Free and open-source, allowing anyone to set up their DAO's on-chain governance.
- **Secure governance model**: Built on the OpenZeppelin Governor framework, ensuring high security and reliability. See the [Governance Model](https://docs.degov.ai/governance/intro/model) for more details.

## Setup Instructions

1. **Clone the repository**

   ```bash
   git clone https://github.com/ringecosystem/degov.git
   cd degov
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set required variables:

   ```env
   DEGOV_DB_PASSWORD=your-secure-password
   DEGOV_WEB_JWT_SECRET=your-jwt-secret
   DEGOV_SYNC_AUTH_TOKEN=your-sync-token
   CHAIN_RPC_1=https://eth-mainnet-rpc-url
   ```

3. **Configure your DAO**

   Edit `degov.yml` with your DAO settings (governor address, chain ID, etc.)

4. **Start all services**

   ```bash
   docker-compose up -d
   ```

   This starts:
   - PostgreSQL (port 5432)
   - Indexer (port 4350)
   - Web application (port 3000)

5. **Access the application**

   Open `http://localhost:3000` in your browser


We are also willing to provide hosting and maintenance services for your DAO's DeGov instance. Please contact us for more details.

## Contributing

We welcome community contributions! Fork the repository and submit a pull request. For major changes, please open an issue to discuss your proposal first.
