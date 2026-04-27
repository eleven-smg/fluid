#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import path from "path";
import { FluidClient } from "../FluidClient";
import StellarSdk from "@stellar/stellar-sdk";

const program = new Command();

program
  .name("fluid")
  .description("Fluid Platform CLI for developers")
  .version("0.1.0");

const config = program.command("config").description("Manage platform configurations");

config
  .command("upload")
  .description("Upload a local configuration file to the Fluid platform")
  .argument("<file>", "Path to the configuration file (JSON)")
  .option("-s, --server <url>", "Fluid server URL", "http://localhost:3000")
  .action(async (file, options) => {
    try {
      const filePath = path.resolve(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found at ${filePath}`);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, "utf8");
      const configData = JSON.parse(content);

      console.log(`Uploading configuration from ${file} to ${options.server}...`);
      
      // Mocked implementation for config upload
      // In a real scenario, this would call a protected endpoint on the Fluid server
      const response = await fetch(`${options.server}/cli/config/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Fluid-CLI-Version": "0.1.0",
        },
        body: JSON.stringify(configData),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${await response.text()}`);
      }

      console.log("✅ Configuration uploaded successfully!");
    } catch (error) {
      console.error(`❌ Upload failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

config
  .command("download")
  .description("Download the latest platform configuration")
  .argument("[destination]", "Path to save the configuration", "./fluid.config.json")
  .option("-s, --server <url>", "Fluid server URL", "http://localhost:3000")
  .action(async (destination, options) => {
    try {
      console.log(`Downloading configuration from ${options.server}...`);

      const response = await fetch(`${options.server}/cli/config/download`, {
        method: "GET",
        headers: {
          "X-Fluid-CLI-Version": "0.1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${await response.text()}`);
      }

      const configData = await response.json();
      const destPath = path.resolve(process.cwd(), destination);
      
      fs.writeFileSync(destPath, JSON.stringify(configData, null, 2));
      console.log(`✅ Configuration saved to ${destPath}`);
    } catch (error) {
      console.error(`❌ Download failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program.parse();
