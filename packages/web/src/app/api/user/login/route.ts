import { NextResponse } from "next/server";

export async function POST() {
  // For example, fetch data from your DB here
  const users = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' }
  ];
  // return new Response(JSON.stringify(users), {
  //   status: 200,
  //   headers: { 'Content-Type': 'application/json' }
  // });

  return NextResponse.json(users);
}
 
